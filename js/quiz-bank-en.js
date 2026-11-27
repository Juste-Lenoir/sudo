// Built-in question bank (English): quiz without AI.
const Q = (domain, q, choix, bonne, explication, notion) => ({ domain, q, choix, bonne, explication, notion, illustration: null });

export const BANK_EN = [
  // Hardware
  Q('materiel', 'Which connector is the main power feed for the motherboard?', ['ATX 24-pin', 'EPS 8-pin', 'PCIe 6+2', 'SATA power'], 0, 'The ATX 24-pin powers the motherboard; the EPS 8-pin powers the CPU.', 'power connectors'),
  Q('materiel', 'Where does the EPS 8-pin cable plug in?', ['Near the CPU socket', 'On the graphics card', 'On the SSD', 'On the front panel'], 0, 'EPS (CPU power) sits at the top of the motherboard, near the socket.', 'EPS CPU'),
  Q('materiel', 'Why wear an antistatic wrist strap?', ['To keep electrostatic discharge from damaging components', 'To protect yourself from 230 V', 'To cool the components', 'To improve RAM contact'], 0, 'Electrostatic discharge (ESD), even invisible, can damage a chip.', 'ESD'),
  Q('materiel', 'Which bus does an M.2 NVMe SSD use?', ['PCIe', 'SATA', 'USB', 'IDE'], 0, 'NVMe runs over PCIe lanes; some M.2 SSDs are SATA, so check.', 'M.2 NVMe'),
  Q('materiel', 'A PC beeps at boot with no picture. What should you check first?', ['The RAM, fully seated', 'The Windows version', 'The network cable', 'The keyboard'], 0, 'POST beeps often point to a memory problem; the code depends on the BIOS (see the motherboard manual).', 'POST'),
  Q('materiel', 'On a motherboard with 4 slots and 2 sticks, where do they go for dual channel?', ['In the slots the manual says (often A2 and B2)', 'In the first two slots side by side', 'Anywhere', 'In A1 and A2'], 0, 'The manual lists the priority slots, often A2 and B2.', 'dual channel'),

  // Networking
  Q('reseau', 'Which mask matches /26?', ['255.255.255.192', '255.255.255.128', '255.255.255.224', '255.255.255.240'], 0, '26 bits set to 1: 255.255.255.192, i.e. 64 addresses, 62 usable.', 'CIDR mask'),
  Q('reseau', 'How many usable hosts in a /24?', ['254', '256', '255', '252'], 0, '2⁸ = 256 addresses, minus the network address and the broadcast.', 'usable hosts'),
  Q('reseau', 'On a Cisco switch, which command puts a port in trunk mode?', ['switchport mode trunk', 'switchport access vlan 10', 'trunk enable', 'ip trunk'], 0, 'switchport mode trunk; the port then carries several tagged VLANs (802.1Q).', 'trunk'),
  Q('reseau', 'Which Cisco command shows a summary of interfaces and their IP addresses?', ['show ip interface brief', 'show running-config vlan', 'show mac', 'ip route'], 0, 'show ip interface brief (sh ip int br): interfaces, IP, Status and Protocol.', 'show ip int br'),
  Q('reseau', 'In what order does DHCP work?', ['Discover, Offer, Request, Acknowledge', 'Request, Offer, Discover, Acknowledge', 'Offer, Discover, Acknowledge, Request', 'Discover, Request, Offer, Acknowledge'], 0, 'DORA: Discover, Offer, Request, Acknowledge.', 'DORA'),
  Q('reseau', 'A 169.254.x.x address on a computer means:', ['It got no answer from the DHCP server (APIPA)', 'It is on the Internet', 'It is a public address', 'DNS isn’t responding'], 0, 'APIPA: the computer assigned itself an address because there was no DHCP. Check the cable, VLAN and DHCP server.', 'APIPA'),
  Q('reseau', 'Which protocol turns a name into an IP address?', ['DNS', 'DHCP', 'ARP', 'NAT'], 0, 'DNS resolves names; ARP maps an IP to a MAC address on the local network.', 'DNS'),

  // Windows
  Q('windows', 'Which command shows the full IP configuration on Windows?', ['ipconfig /all', 'ifconfig -a', 'ip a', 'netstat -r'], 0, 'ipconfig /all: IP, mask, gateway, DNS, MAC address, DHCP.', 'ipconfig'),
  Q('windows', 'Which command repairs Windows system files?', ['sfc /scannow', 'chkdsk /r', 'gpupdate /force', 'diskpart'], 0, 'sfc /scannow checks and repairs system files; DISM repairs the image if sfc fails.', 'sfc'),
  Q('windows', 'Where do you manage programs that launch at startup?', ['Task Manager → Startup', 'Control Panel → Sound', 'Explorer → View', 'Settings → Time'], 0, 'The Startup tab in Task Manager turns startup programs on or off.', 'startup'),
  Q('windows', 'Which command flushes the computer’s DNS cache?', ['ipconfig /flushdns', 'ipconfig /release', 'nslookup /clear', 'dns /flush'], 0, 'ipconfig /flushdns empties the DNS resolver cache.', 'DNS cache'),
  Q('windows', 'Which tool creates a report on a laptop battery’s wear?', ['powercfg /batteryreport', 'msinfo32 /battery', 'chkdsk /battery', 'perfmon /report'], 0, 'powercfg /batteryreport creates an HTML report with the original and current capacity.', 'battery'),

  // Windows Server
  Q('winserver', 'Which role manages a domain’s users and computers?', ['AD DS', 'DHCP', 'IIS', 'WSUS'], 0, 'Active Directory Domain Services (AD DS) manages the domain, accounts and GPOs.', 'AD DS'),
  Q('winserver', 'Which command forces GPOs to apply on a computer?', ['gpupdate /force', 'gpresult /r', 'sfc /scannow', 'dcpromo'], 0, 'gpupdate /force; gpresult /r shows the applied GPOs.', 'GPO'),
  Q('winserver', 'Why is DNS essential to Active Directory?', ['Computers find domain controllers through SRV records', 'It hands out IP addresses', 'It encrypts passwords', 'It replaces DHCP'], 0, 'Clients locate DCs through SRV records in DNS.', 'DNS and AD'),
  Q('winserver', 'A GPO linked to an OU applies to:', ['The objects in that OU (and its child OUs)', 'The whole domain', 'Servers only', 'Administrators only'], 0, 'It applies to the OU and inherits down to child OUs, unless blocked.', 'GPO and OU'),
  Q('winserver', 'In PowerShell, which command creates an AD user?', ['New-ADUser', 'Add-User', 'Set-ADUser', 'net group'], 0, 'New-ADUser (ActiveDirectory module); Set-ADUser changes an existing account.', 'New-ADUser'),

  // Linux
  Q('linux', 'What does chmod 755 do to a file?', ['rwx for the owner, r-x for group and others', 'rwx for everyone', 'Read-only for all', 'Removes all permissions'], 0, '7 = rwx, 5 = r-x.', 'chmod'),
  Q('linux', 'Which command shows IP addresses on Linux?', ['ip a', 'ipconfig', 'show ip', 'netsh'], 0, 'ip a (ip address); ifconfig is the older command.', 'ip a'),
  Q('linux', 'How do you restart the ssh service with systemd?', ['sudo systemctl restart ssh', 'service ssh reboot', 'sudo reboot ssh', 'systemctl ssh restart'], 0, 'systemctl restart <service>; status to check.', 'systemctl'),
  Q('linux', 'Which command shows free disk space in a readable way?', ['df -h', 'du -s', 'free -h', 'ls -l'], 0, 'df -h: space per file system; du measures folder sizes.', 'df'),
  Q('linux', 'Where are user accounts stored?', ['/etc/passwd', '/etc/hosts', '/var/log', '/home/users'], 0, '/etc/passwd lists accounts; hashed passwords are in /etc/shadow.', 'passwd'),

  // macOS
  Q('macos', 'Which shortcut opens Spotlight search?', ['⌘ + Space', '⌃ + Alt + Delete', '⌘ + Q', '⌥ + Tab'], 0, '⌘ + Space opens Spotlight.', 'Spotlight'),
  Q('macos', 'Which tool backs up a Mac automatically?', ['Time Machine', 'Disk Utility', 'Activity Monitor', 'Console'], 0, 'Time Machine backs up to an external drive or a NAS.', 'Time Machine'),
  Q('macos', 'Where can you see which program is using the CPU?', ['Activity Monitor', 'Network settings', 'Keychain Access', 'Finder'], 0, 'Activity Monitor is the equivalent of Task Manager.', 'Activity Monitor'),

  // Virtualization
  Q('virtu', 'In Bridged mode, a VM:', ['Gets an IP on the same network as the host', 'Is cut off from any network', 'Shares the host’s IP (NAT)', 'Only sees other VMs'], 0, 'Bridged: the VM is one more computer on the physical network.', 'Bridged'),
  Q('virtu', 'In NAT mode, a VM:', ['Reaches the Internet through the host’s IP, but can’t be reached directly', 'Has a public IP', 'Is on the physical network', 'Has no network access'], 0, 'NAT: the VM goes through the host; other machines on the network don’t see it.', 'NAT'),
  Q('virtu', 'What is a snapshot for?', ['Going back to the VM’s state at a given moment', 'Backing up the VM elsewhere for good', 'Speeding up the VM', 'Cloning the host’s hardware'], 0, 'A snapshot lets you roll back; it isn’t a real backup.', 'snapshot'),
  Q('virtu', 'Which VMware network mode isolates VMs from each other, with no host or Internet?', ['LAN Segment', 'Bridged', 'NAT', 'Host-only with DHCP'], 0, 'A LAN Segment is a private network between VMs only.', 'LAN Segment'),

  // Security
  Q('securite', 'What is two-factor authentication?', ['Proving your identity with two different kinds of factors', 'Two passwords', 'A very long password', 'Changing your password twice a year'], 0, 'For example something you know (password) and something you have (phone, key).', '2FA'),
  Q('securite', 'The principle of least privilege means:', ['Granting only the permissions needed', 'Giving everyone admin rights', 'Removing all permissions', 'Sharing a common account'], 0, 'Each account only has the permissions it needs, which limits damage if it’s compromised.', 'least privilege'),
  Q('securite', 'An urgent email asks you to click to “unlock your account”. It’s probably:', ['Phishing', 'A normal update', 'A message from official support', 'Harmless spam'], 0, 'Urgency + link + request for credentials: classic phishing signs. Check the sender and go through the official site.', 'phishing'),
  Q('securite', 'The 3-2-1 backup rule is:', ['3 copies, 2 different media, 1 off-site', '3 disks, 2 servers, 1 cloud', '3 backups a day', '3 passwords, 2 accounts, 1 key'], 0, '3 copies of the data, on 2 types of media, 1 of them off-site.', '3-2-1'),

  // Scripting
  Q('prog', 'In PowerShell, which command lists services?', ['Get-Service', 'List-Service', 'ls services', 'Show-Service'], 0, 'Get-Service; filter with Where-Object, e.g. Get-Service | Where-Object Status -eq Running.', 'Get-Service'),
  Q('prog', 'In Bash, how do you make a script executable?', ['chmod +x script.sh', 'exec script.sh', 'run script.sh', 'sudo script.sh'], 0, 'chmod +x then ./script.sh.', 'chmod +x'),
  Q('prog', 'What does the pipe | do?', ['Sends one command’s output to the next', 'Redirects to a file', 'Runs two commands in parallel', 'Comments out the line'], 0, 'command1 | command2: the first one’s output becomes the second one’s input. > redirects to a file.', 'pipe'),
];
