// Liste des ateliers et création d'un atelier à partir d'une consigne (texte, dictée, photo).
import { dbAll, put, uid, getProfile } from '../store.js';
import { askJSON } from '../ai.js';
import { analyse, base } from '../prompts.js';
import { $, esc, toast, domainTag, fmtDate, icon, autoGrow, setupDictation, pickImages, loading, paintIcons } from '../ui.js';
import { statusOf } from './verif.js';

export const EXEMPLE = `Atelier VMWare :
Téléchargez VMWARE et créez trois machines virtuelles :
Première machine : Créez une première machine virtuelle avec Windows 10 :
- Attribuez lui 4 Go de RAM.
- Attribuez lui un disque dur virtuel de 40GO.
- Configurez la carte réseau afin que votre machine virtuelle ait accès à Internet et soit considérée comme une machine réelle sur le réseau (réseau pont ou bridge).
Faites un IPCONFIG de votre VM, quelle est son adresse IP et sa passerelle ?
Deuxième machine : Créez une deuxième machine virtuelle avec Windows 10 :
- Attribuez lui 4 Go de RAM.
- Attribuez lui un disque dur virtuel de 40GO.
- Configurez la carte réseau de la deuxième machine virtuelle afin de créer un sous réseau virtuel entre votre machine et le routeur perspectives (NAT).
Faites un IPCONFIG de votre VM, quelle est son adresse IP et sa passerelle ?
Troisième machine : Créez une deuxième machine virtuelle avec Manjaro Linux xfce :
- Attribuez lui 2 Go de RAM.
- Attribuez lui un disque dur virtuel de 20GO.
- Configurez la carte réseau de la troisième machine virtuelle afin de l'intégrer à un réseau local : LAN segment.
Faites un IPA de votre VM, quelle est son adresse IP et sa passerelle ?`;

export async function ateliersList(v) {
  const all = (await dbAll('ateliers')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  v.innerHTML = `
    <div class="row" style="margin-bottom:16px"><h1 style="margin:0">Ateliers</h1><span class="grow"></span>
      <a class="btn primary" href="#/atelier/nouveau">${icon('plus')}Nouvel atelier</a></div>
    ${all.length ? `<div class="list">${all.map(a => {
      const st = statusOf(a);
      const done = (a.steps || []).filter(s => s.done).length;
      return `<a class="item" href="#/atelier/${a.id}">
        <div class="grow"><div class="t">${esc(a.title)}</div>
        <div class="s">${fmtDate(a.updatedAt || a.createdAt)} · ${done}/${(a.steps || []).length} étapes</div></div>
        ${domainTag(a.domain)}<span class="tag ${st.cls}">${st.label}${a.best != null ? ' · ' + a.best + '/20' : ''}</span></a>`;
    }).join('')}</div>`
    : `<div class="card empty"><p>Aucun atelier pour l'instant.</p><p class="small">Prends la consigne du formateur en photo, dicte-la ou tape-la : sudo en fait un plan d'étapes.</p><a class="btn primary" href="#/atelier/nouveau">Créer mon premier atelier</a></div>`}`;
}

export async function atelierNew(v) {
  let images = [];
  v.innerHTML = `
    <div class="row" style="margin-bottom:6px"><a class="icon-btn" href="#/ateliers" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Nouvel atelier</h1></div>
    <p class="sub">La consigne telle que le formateur l'a donnée, même incomplète ou avec des fautes : sudo repère ce qui est flou.</p>
    <div class="stack" style="max-width:760px">
      <div class="card stack">
        <div class="row"><button class="btn primary" data-cam>${icon('camera')}Photo de la consigne</button><button class="btn ghost" data-ex>Essayer avec l'exemple VMware</button></div>
        <div class="row" data-imgs></div>
        <label class="field">Consigne en texte (ou dictée)
          <textarea class="input" rows="6" data-txt placeholder="Ex. : Créez 3 VM, une en pont, une en NAT…"></textarea></label>
        <div class="row"><button class="btn sm ghost mic" data-mic hidden>${icon('mic')}Dicter</button></div>
      </div>
      <div class="grid2">
        <label class="field">Titre (facultatif)<input class="input" data-title placeholder="trouvé automatiquement sinon"></label>
        <label class="field">Où tu travailles<input class="input" data-env placeholder="VMware Workstation, Packet Tracer, vrai matériel…"></label>
      </div>
      <button class="btn primary big block" data-go>Analyser la consigne</button>
      <div data-out></div>
    </div>`;
  const ta = $('[data-txt]', v);
  autoGrow(ta, 360);
  setupDictation($('[data-mic]', v), ta);
  const drawImgs = () => {
    $('[data-imgs]', v).innerHTML = images.map((u, i) => `<div class="thumb"><img src="${esc(u)}" alt="photo de la consigne"><button data-rm="${i}" aria-label="Retirer">✕</button></div>`).join('');
  };
  $('[data-imgs]', v).addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { images.splice(+b.dataset.rm, 1); drawImgs(); } });
  $('[data-cam]', v).onclick = async () => { images.push(...await pickImages({ camera: true })); drawImgs(); };
  $('[data-ex]', v).onclick = () => { ta.value = EXEMPLE; ta.dispatchEvent(new Event('input')); $('[data-env]', v).value = 'VMware Workstation sur mon PC'; };
  $('[data-go]', v).onclick = async () => {
    const text = ta.value.trim();
    if (!text && !images.length) { toast('Ajoute une photo ou le texte de la consigne'); return; }
    const at = {
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
      title: $('[data-title]', v).value.trim(), env: $('[data-env]', v).value.trim(),
      domain: 'autre', consigne: { text, images }, chat: [], notes: '', view: 'etabli',
    };
    const out = $('[data-out]', v);
    $('[data-go]', v).disabled = true;
    loading(out, 'Lecture de la consigne');
    try {
      const prof = await getProfile();
      const a = await askJSON({ system: base(prof), prompt: analyse(at), images, task: 'best', onInfo: toast });
      applyAnalysis(at, a);
      await put('ateliers', at);
      location.hash = '#/atelier/' + at.id;
    } catch (e) {
      out.innerHTML = `<div class="card"><p>L'analyse n'a pas marché : ${esc(e.message)}</p><p class="small muted">Vérifie tes IA dans Réglages, ou réessaie.</p></div>`;
      $('[data-go]', v).disabled = false;
    }
  };
  paintIcons(v);
}

export function applyAnalysis(at, a) {
  at.analysis = a;
  at.title = at.title || a.titre || 'Atelier';
  at.domain = a.domaine || at.domain;
  at.physique = !!a.physique;
  at.clarifs = (a.a_clarifier || []).map(c => ({ point: c.point, proposition: c.proposition, reponse: '' }));
  at.steps = (a.etapes || []).map(s => ({
    titre: s.titre, groupe: s.groupe || '', but: s.but || '', validation: s.validation || '',
    faire: (s.faire || []).map(t => ({ t, done: false })),
    releves: (s.releves || []).map(champ => ({ champ, valeur: '' })),
    commandes: s.commandes || [], done: false, hint: 0, showCmd: false,
  }));
  at.cur = 0;
}
