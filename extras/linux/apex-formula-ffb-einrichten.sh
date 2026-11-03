#!/bin/bash
# Apex Formula – einmalige Einrichtung für Force Feedback unter Linux (auch Bazzite/Fedora Atomic).
# Kopiert eine udev-Regel nach /etc/udev/rules.d (dort auch auf unveränderlichen Systemen beschreibbar).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
RULE="71-apex-formula-logitech.rules"
if [ ! -f "$DIR/$RULE" ]; then echo "Fehlt: $DIR/$RULE (bitte das ganze ZIP entpacken)"; exit 1; fi
echo "Installiere udev-Regel (Passwort für sudo wird abgefragt) …"
sudo install -m 0644 "$DIR/$RULE" "/etc/udev/rules.d/$RULE"
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw
echo
echo "Fertig. Lenkrad einmal ab- und wieder anstecken, Browser neu starten."
echo "Flatpak-Browser (z. B. Chrome aus Flathub) brauchen zusätzlich Gerätezugriff:"
echo "  flatpak override --user --device=all com.google.Chrome"
echo "Entfernen: sudo rm /etc/udev/rules.d/$RULE && sudo udevadm control --reload-rules"
