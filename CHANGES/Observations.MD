## Observations and bugfixes with AR mode
1. The video image is mirrored. Fix: The video image should always be unmirrored. Left is left and right is right.
2. Predefined molecules can not be rotated like self built molecules. Fix: All molecules, regardless if they are self-built or loaded from preset, should be loaded on the same platform and  behave in the same way (i.e. I should be able to rotate them). Self built molecules and predefined molecules should not show up at the same time. If I build a molecule and then load one from the predefined set, the self-built molecule disappears.
3. I want to be able to switch off the video image in AR mode (the camera remains on to track the AR markers).
4. I want to be able to use the app and build molecules even if some or all markers are absent. 
a) replacement for platform: Use the center of the screen as a fixed location for the molecule
b) replacement for elements, incl. benzene: Loading of atoms and benzene rings should be possible by clicking on the elements palette on the left side of the screen (benzene still missing there)
c) replacement for transport / grabber: By choosing an element or benzene ring (see 4.b) it is placed near the virtual platform, where the molecule resides. It has to be near enough so that the helper grid (thetraedron lines and ghost atoms) is visible and I can choose the appropriate bond (single, double or triple bond) by simply rotating the molecule. The bond is then executed by clicking the mouse or the space bar on the keyboard.
d) replacement for cube: Use the mouse or trackpad, similarly as in standard mode without AR
e) replacement for additional markers: Show replacements on the left side of the screen below the elements palette, so I can simply click them.
Additional note: Each marker can be absent individually or any combination of markers can be absent or present. The app should be able to switch seamlessly between the above mentioned alternatives.
5. I want keyboard shortcuts for all the elements in the pallette (incl. benzene) as well as for the specific buttons below.