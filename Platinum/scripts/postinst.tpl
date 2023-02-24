#!/bin/bash

# Link to the binary
ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'

# SUID chrome-sandbox for Electron 5+
chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true

chmod +x '/opt/${sanitizedProductName}/resources/engine/linux/x64/aria2c'
chmod +x '/opt/${sanitizedProductName}/resources/engine/linux/ia32/aria2c'

update-mime-database /usr/share/mime || true
update-desktop-database /usr/share/applications || true