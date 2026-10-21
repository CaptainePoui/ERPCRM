#!/bin/bash
# Inventaire d'une VM Linux (ex. DashV16) -- LECTURE SEULEMENT. Lancer : bash inventaire_vm_linux.sh > inventaire.txt 2>&1
echo "=== $(hostname) $(date -I)"; nproc; free -g | head -2
echo "=== DISQUES"; lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL; df -h -x tmpfs -x devtmpfs -x overlay -x squashfs
echo "=== GROS DOSSIERS"; sudo du -xh --max-depth=3 / 2>/dev/null | sort -h | tail -25
echo "=== BASES POSTGRESQL"; sudo -u postgres psql -Atc "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database where not datistemplate order by pg_database_size(datname) desc" 2>/dev/null
echo "=== AUTRES BASES"; sudo du -sh /var/lib/mysql /var/lib/influxdb /var/lib/clickhouse /var/lib/redis /var/lib/mongodb 2>/dev/null
echo "=== DOCKER"; docker system df 2>/dev/null; docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null
echo "=== CROISSANCE : donnees ajoutees par mois dans /home et /var/lib (fichiers > 1 Mo)"
sudo find /home /var/lib -xdev -type f -size +1M -printf '%TY-%Tm %s\n' 2>/dev/null | awk '{a[$1]+=$2} END {for (m in a) printf "%s %.0f Mo\n", m, a[m]/1048576}' | sort | tail -12
