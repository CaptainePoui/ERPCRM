# Inventaire du HP Z620 (Windows Server / Hyper-V) -- LECTURE SEULEMENT, ne modifie rien.
# A lancer dans PowerShell « Exécuter en tant qu'administrateur ». Résultat : inventaire_z620.txt sur le Bureau.
$o = Join-Path ([Environment]::GetFolderPath('Desktop')) 'inventaire_z620.txt'
& {
  '=== ORDINATEUR'; Get-CimInstance Win32_ComputerSystem | Select Manufacturer, Model, @{n='RAM_Go';e={[math]::Round($_.TotalPhysicalMemory/1GB)}}
  Get-CimInstance Win32_OperatingSystem | Select Caption, Version
  Get-CimInstance Win32_Processor | Select Name, NumberOfCores, NumberOfLogicalProcessors
  '=== MEMOIRE (barrettes)'; Get-CimInstance Win32_PhysicalMemory | Select DeviceLocator, @{n='Go';e={$_.Capacity/1GB}}, Speed, Manufacturer, PartNumber
  '=== DISQUES PHYSIQUES'; Get-PhysicalDisk | Select DeviceId, FriendlyName, SerialNumber, MediaType, BusType, @{n='Go';e={[math]::Round($_.Size/1GB)}}, HealthStatus, OperationalStatus
  '=== SANTE DES DISQUES'; Get-PhysicalDisk | Get-StorageReliabilityCounter | Select DeviceId, Temperature, Wear, PowerOnHours, ReadErrorsTotal, WriteErrorsTotal
  '=== DISQUES ET PARTITIONS'; Get-Disk | Select Number, FriendlyName, BusType, PartitionStyle, @{n='Go';e={[math]::Round($_.Size/1GB)}}, IsBoot, IsSystem
  Get-Partition | Select DiskNumber, PartitionNumber, DriveLetter, @{n='Go';e={[math]::Round($_.Size/1GB,1)}}, Type
  '=== VOLUMES'; Get-Volume | Where DriveLetter | Select DriveLetter, FileSystemLabel, FileSystem, @{n='Go';e={[math]::Round($_.Size/1GB)}}, @{n='Libre_Go';e={[math]::Round($_.SizeRemaining/1GB)}}, HealthStatus
  '=== RAID / STORAGE SPACES'; Get-StoragePool -IsPrimordial $false -ErrorAction SilentlyContinue | Select FriendlyName, HealthStatus, @{n='Go';e={[math]::Round($_.Size/1GB)}}
  Get-VirtualDisk -ErrorAction SilentlyContinue | Select FriendlyName, ResiliencySettingName, @{n='Go';e={[math]::Round($_.Size/1GB)}}, HealthStatus
  Get-CimInstance Win32_SCSIController | Select Name, Manufacturer
  '=== MACHINES VIRTUELLES'; Get-VM | Select Name, State, ProcessorCount, @{n='RAM_actuelle_Go';e={[math]::Round($_.MemoryAssigned/1GB,1)}}, @{n='RAM_depart_Go';e={[math]::Round($_.MemoryStartup/1GB,1)}}, DynamicMemoryEnabled, Generation, Path
  '=== DISQUES DES VM (VHDX)'; Get-VM | Get-VMHardDiskDrive | ForEach-Object { $v = Get-VHD -Path $_.Path; [pscustomobject]@{ VM=$_.VMName; Fichier=$_.Path; Type=$v.VhdType; Reel_Go=[math]::Round($v.FileSize/1GB,1); Max_Go=[math]::Round($v.Size/1GB) } }
  '=== POINTS DE CONTROLE (snapshots)'; Get-VM | Get-VMSnapshot | Select VMName, Name, CreationTime
  '=== RESEAU DES VM'; Get-VM | Get-VMNetworkAdapter | Select VMName, SwitchName, @{n='IP';e={$_.IPAddresses -join ' '}}
  '=== CARTES RESEAU'; Get-NetAdapter | Select Name, InterfaceDescription, LinkSpeed, Status
  '=== CARTES GRAPHIQUES'; Get-CimInstance Win32_VideoController | Select Name, @{n='Mo';e={[math]::Round($_.AdapterRAM/1MB)}}
} | Format-List | Out-File -FilePath $o -Width 300 -Encoding utf8
notepad $o
