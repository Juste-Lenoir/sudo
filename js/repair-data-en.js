// Repair (English): labels, safety before opening and offline diagnosis paths.
export const LABELS_EN = {
  types: { telephone: 'Phone', tablette: 'Tablet', portable: 'Laptop', fixe: 'Desktop PC', autre: 'Other' },
  results: { en_cours: 'In progress', repare: 'Repaired', piece: 'Part to order', revenir: 'Come back', pas_repare: 'Not repairable' },
};

export function safetyEN(t, mobile) {
  const list = [
    { id: 'donnees', t: 'Data backed up by the owner', d: 'Or they accept in writing the risk of losing it. A repair can wipe the device.' },
    { id: 'verrou', t: 'The owner unlocks it themselves', d: 'Never bypass a passcode, an account (Apple, Google, Microsoft) or a BIOS password.' },
    { id: 'eteint', t: 'Off and unplugged', d: 'Charger, power cable and peripherals removed before opening.' },
    { id: 'esd', t: 'Static electricity', d: 'Antistatic strap connected to ground, or touch an unpainted metal part before handling boards.' },
  ];
  if (mobile) list.push(
    { id: 'batterie', t: 'Battery inspected', d: 'Swollen, punctured or hot: don’t charge it, don’t pierce it, put it in a metal or fireproof tray, away from everything.' },
    { id: 'deconnecte', t: 'Battery disconnected first', d: 'Unplug the battery connector before any other ribbon cable, with a plastic tool (spudger).' },
    { id: 'outils', t: 'No metal tools near the battery', d: 'Risk of short circuit and fire. To unglue: gentle heat (iOpener, low hot-air gun), never on the battery.' },
  );
  if (t === 'fixe') list.push(
    { id: 'condo', t: 'Power cable removed, wait 30 s', d: 'Press the power button to drain the capacitors. Never open the power supply: dangerous voltage even unplugged.' },
  );
  list.push(
    { id: 'vis', t: 'Screws kept in order', d: 'Magnetic mat or compartment tray: the screws aren’t all the same length.' },
    { id: 'photos', t: 'Photos at every teardown step', d: 'So the ribbon cables and screws go back in the right place.' },
  );
  return list;
}

export const TREES_EN = {
  allume: {
    label: 'Won’t turn on', start: 'a1',
    n: {
      a1: { q: 'Plugged in for 15 min on a known-good charger and cable, is there any sign of life?', d: 'Charging light, vibration, sound, logo, screen glowing faintly. A USB tester (ammeter) helps a lot.', oui: 'a2', non: 'a4' },
      a2: { q: 'The screen stays black, but the device is alive (sound, vibration, fan, lights)?', oui: 'f_ecran', non: 'a3' },
      a3: { q: 'Does it start and then shut down or reboot in a loop?', oui: 'f_boucle', non: 'f_demarre' },
      a4: { q: 'Is the charging port clean, with no play or bent pin?', d: 'Look with a flashlight: lint, dust, green or white corrosion.', oui: 'a5', non: 'f_port' },
      a5: { q: 'Is it a desktop PC?', oui: 'f_alim', non: 'f_batt' },
      f_ecran: { fin: 'Probably a display fault', d: 'Screen, ribbon cable or backlight. Try an external video output (HDMI on a PC) and shine a flashlight on the screen: a very dark picture = backlight. Reseat the ribbon cable (battery disconnected) before ordering a screen.', go: 'ecran' },
      f_boucle: { fin: 'Worn-out battery or damaged system', d: 'Charge for 30 min, then try again. Phone or tablet: recovery mode (the manufacturer’s button combination). PC: boot with the minimum (one RAM stick, no peripherals) and watch the motherboard beeps or lights. Swollen battery: replace it.' },
      f_demarre: { fin: 'It charges but won’t boot', d: 'Force restart (the manufacturer’s button combination), dirty or broken power button. Laptop: remove the battery if possible and test on mains only. PC: reseat the RAM, reset the BIOS (CMOS battery out for 1 min).' },
      f_port: { fin: 'Charging port', d: 'Device off: clean it dry with a wooden toothpick or an antistatic brush, never metal. Corroded or broken pin: replace the port (often a small daughterboard or a flex cable).' },
      f_alim: { fin: 'Power supply or case button', d: 'Switch at the back of the power supply, outlet, power cable. Test the power supply with an ATX tester. Case button: check the PWR_SW cable on the motherboard’s front panel header.' },
      f_batt: { fin: 'Dead battery or charging circuit', d: 'Leave it 30 min on the original charger. On a USB tester: 0.00 A = the device draws nothing (port or charging circuit); some current = battery charging or dead. Laptop: remove the battery and test on mains only.' },
    },
  },
  charge: {
    label: 'Won’t charge, weak battery', start: 'c1',
    n: {
      c1: { q: 'With another known-good cable and charger, does it charge?', oui: 'f_cable', non: 'c2' },
      c2: { q: 'Does the cable sit firmly in the port, without play or a loose contact?', oui: 'c3', non: 'f_port' },
      c3: { q: 'It charges, but the battery drains very fast or the device shuts down around 20 or 30%?', oui: 'f_usee', non: 'f_carte' },
      f_cable: { fin: 'Cable or charger at fault', d: 'Replace it with a certified one, at the right power (laptop: the same voltage as printed under the device).' },
      f_port: { fin: 'Dirty or worn charging port', d: 'Dry cleaning (wooden toothpick, antistatic brush), device off. If there’s still play: replace the port.' },
      f_usee: { fin: 'Worn battery', d: 'Check its health. iPhone: Settings → Battery → Battery Health. Windows: `powercfg /batteryreport` in a terminal. macOS: System Information → Power (cycle count). Android: the manufacturer’s app or code. Below 80% capacity: replace it.' },
      f_carte: { fin: 'No charging detected', d: 'Charging port (often on a daughterboard) or the motherboard’s charging circuit. Measure with a USB tester. Laptop: check the power jack (DC jack) and the charger voltage.' },
    },
  },
  ecran: {
    label: 'Broken screen or odd picture', start: 'e1',
    n: {
      e1: { q: 'The glass is cracked, but the picture and touch work?', oui: 'f_vitre', non: 'e2' },
      e2: { q: 'Lines, spots, weird colors or ghost touches?', oui: 'e3', non: 'e4' },
      e3: { q: 'Does it change when you press gently near the ribbon cable or move the hinge (laptop)?', oui: 'f_nappe', non: 'f_dalle' },
      e4: { q: 'With a flashlight against the screen, can you make out a very dark picture?', oui: 'f_retro', non: 'f_noir' },
      f_vitre: { fin: 'Cracked glass', d: 'On most recent phones, glass and panel are bonded: you replace the whole screen assembly. Put tape over the cracks before opening, and protect your fingers.' },
      f_nappe: { fin: 'Loose ribbon cable', d: 'Battery disconnected, reseat the display ribbon cable (and the touch one). Laptop: the cable runs through the hinge and wears out from opening and closing.' },
      f_dalle: { fin: 'Damaged panel', d: 'Impact, pressure or liquid: replace the screen. Note the reference on the back of the panel to order the right one.' },
      f_retro: { fin: 'Backlight', d: 'The picture is there but unlit: ribbon cable, fuse or backlight circuit, or the screen’s lamp. Start by reseating the ribbon cable.' },
      f_noir: { fin: 'No picture at all', d: 'Check that the device really boots (sound, lights). If not, follow the “Won’t turn on” path.', go: 'allume' },
    },
  },
  lent: {
    label: 'Slow or crashing PC', start: 'l1',
    n: {
      l1: { q: 'Is the system on a mechanical hard drive (HDD)?', d: 'Windows: Task Manager → Performance → disk type. An HDD makes noise and spins.', oui: 'f_ssd', non: 'l2' },
      l2: { q: 'At idle, is the CPU or memory near 100%?', d: 'Task Manager (Windows), Activity Monitor (macOS), `top` (Linux).', oui: 'l3', non: 'l4' },
      l3: { q: 'Is one specific program taking it all?', oui: 'f_prog', non: 'f_ram' },
      l4: { q: 'Does the PC run hot or the fan blow hard?', oui: 'f_chauffe', non: 'f_systeme' },
      f_ssd: { fin: 'Switch to an SSD', d: 'It’s the most effective fix. First check the drive’s health (CrystalDiskInfo, or `smartctl -a` on Linux), then clone it to an SSD (Clonezilla) or reinstall the system.' },
      f_prog: { fin: 'Program or malware', d: 'Uninstall it or remove it from startup (Task Manager → Startup). Antivirus scan: Microsoft Defender offline scan.' },
      f_ram: { fin: 'Not enough memory', d: '8 GB minimum recommended for Windows 10 or 11. Add a compatible stick: same type (DDR4, DDR5…), form factor (DIMM or SO-DIMM) and free slots.' },
      f_chauffe: { fin: 'Overheating', d: 'Follow the “Overheating, noisy fan” path.', go: 'chauffe' },
      f_systeme: { fin: 'System to tidy up', d: 'Updates, 15% free disk space, memory test (Windows Memory Diagnostic), then `sfc /scannow` and `DISM /Online /Cleanup-Image /RestoreHealth` as administrator. Last resort: back up, then reinstall.' },
    },
  },
  chauffe: {
    label: 'Overheating, noisy fan, shuts down by itself', start: 'h1',
    n: {
      h1: { q: 'Are the vents or the heatsink full of dust?', oui: 'f_poussiere', non: 'h2' },
      h2: { q: 'Is the fan spinning?', oui: 'f_pate', non: 'f_ventilo' },
      f_poussiere: { fin: 'Cleaning', d: 'Off, unplugged, battery disconnected if possible. Compressed air while holding the fan blades still (otherwise it spins too fast and gets damaged). After 3 or 4 years, redo the thermal paste too.' },
      f_ventilo: { fin: 'Stuck or dead fan', d: 'Clean it. If it doesn’t start again, replace it: the reference is on its label.' },
      f_pate: { fin: 'Thermal paste or battery', d: 'Check temperatures (HWMonitor on Windows, `sensors` on Linux). Dried thermal paste or a loose heatsink: redo the paste. Phone or tablet running hot: check that the battery isn’t swelling.' },
    },
  },
  eau: {
    label: 'Dropped in water or liquid spill', start: 'w1',
    n: {
      w1: { q: 'Is the device still on or charging?', oui: 'f_couper', non: 'f_eau' },
      f_couper: { fin: 'Cut the power now', d: 'Unplug it and turn it off now, without testing whether it works. Then: remove the case, SIM and SD card, open it and disconnect the battery as soon as possible. No rice, no hot hair dryer. Clean the board with isopropyl alcohol (90% or more) and a soft brush, let it air-dry, then look for corrosion (green or white deposits).' },
      f_eau: { fin: 'Liquid damage procedure', d: 'Don’t turn it on or charge it. Remove the case, SIM and SD card. Open it and disconnect the battery as soon as possible. No rice, no hot hair dryer. Clean the board with isopropyl alcohol (90% or more) and a soft brush, let it air-dry. Look for corrosion (green or white deposits) near the connectors. Salt water or a sugary drink: cleaning comes first.' },
    },
  },
};
