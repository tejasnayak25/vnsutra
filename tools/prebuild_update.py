import os
import sys
from PIL import Image
import shutil
import re
import xml.etree.ElementTree as ET
import subprocess

subprocess.run("flutter pub run flutter_launcher_icons:main")

# --- PATH SETUP ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, '..'))
SRC_ICON = os.path.join(PROJECT_ROOT, 'assets', 'icon', 'icon.png')
WIN_ICON = os.path.join(PROJECT_ROOT, 'windows', 'runner', 'resources', 'app_icon.ico')
LINUX_ICON = os.path.join(PROJECT_ROOT, 'linux', 'data', 'flutter_assets', 'assets', 'icon', 'icon.png')
CMAKELISTS = os.path.join(PROJECT_ROOT, 'linux', 'CMakeLists.txt')
MY_APP_CC = os.path.join(PROJECT_ROOT, 'linux', 'my_application.cc')
PUBSPEC = os.path.join(PROJECT_ROOT, 'pubspec.yaml')
ANDROID_MANIFEST = os.path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
ANDROID_STRINGS = os.path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml')
MACOS_PLIST = os.path.join(PROJECT_ROOT, 'macos', 'Runner', 'Info.plist')
IOS_PLIST = os.path.join(PROJECT_ROOT, 'ios', 'Runner', 'Info.plist')

# --- ICON GENERATION ---
if os.path.exists(SRC_ICON):
    img = Image.open(SRC_ICON)
    img.save(WIN_ICON, format='ICO', sizes=[(256,256), (128,128), (64,64), (48,48), (32,32), (16,16)])
    print(f'Windows icon saved to {WIN_ICON}')
    os.makedirs(os.path.dirname(LINUX_ICON), exist_ok=True)
    img.save(LINUX_ICON, format='PNG')
    print(f'Linux icon saved to {LINUX_ICON}')
else:
    print(f'Source icon not found: {SRC_ICON}')

print('For macOS, please use an online tool to generate AppIcon.appiconset and replace in macos/Runner/Assets.xcassets/AppIcon.appiconset/')

# --- APP METADATA UPDATE ---
def update_windows_metadata(name, description):
    rc_path = os.path.join(PROJECT_ROOT, 'windows', 'runner', 'Runner.rc')
    if os.path.exists(rc_path):
        with open(rc_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        with open(rc_path, 'w', encoding='utf-8') as f:
            for line in lines:
                if line.strip().startswith('VALUE "FileDescription",'):
                    f.write(f' VALUE "FileDescription", "{description}" "\\0" \n')
                elif line.strip().startswith('VALUE "ProductName",'):
                    f.write(f' VALUE "ProductName", "{name}" "\\0" \n')
                elif line.strip().startswith('VALUE "InternalName",'):
                    f.write(f' VALUE "InternalName", "{name.replace(" ", "").lower()}" "\\0" \n')
                elif line.strip().startswith('VALUE "OriginalFilename",'):
                    f.write(f' VALUE "OriginalFilename", "{name.replace(" ", "").lower()}.exe" "\\0" \n')
                else:
                    f.write(line)
        print(f'Updated Windows metadata in {rc_path}')
    else:
        print(f'Windows metadata file not found: {rc_path}')

def update_linux_cmakelists(name, app_id):
    if os.path.exists(CMAKELISTS):
        with open(CMAKELISTS, 'r', encoding='utf-8') as f:
            content = f.read()
        content = re.sub(r'set\(BINARY_NAME ".*?"\)', f'set(BINARY_NAME "{name}")', content)
        content = re.sub(r'set\(APPLICATION_ID ".*?"\)', f'set(APPLICATION_ID "{app_id}")', content)
        with open(CMAKELISTS, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated Linux CMakeLists.txt metadata')
    else:
        print(f'Linux CMakeLists.txt not found: {CMAKELISTS}')

def update_linux_myappcc(name):
    if os.path.exists(MY_APP_CC):
        with open(MY_APP_CC, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        with open(MY_APP_CC, 'w', encoding='utf-8') as f:
            for line in lines:
                if 'gtk_header_bar_set_title' in line:
                    f.write(re.sub(r'gtk_header_bar_set_title\(header_bar, ".*?"\);', f'gtk_header_bar_set_title(header_bar, "{name}");', line))
                elif 'gtk_window_set_title(' in line:
                    f.write(re.sub(r'gtk_window_set_title\(window, ".*?"\);', f'gtk_window_set_title(window, "{name}");', line))
                else:
                    f.write(line)
        print(f'Updated Linux my_application.cc window title')
    else:
        print(f'Linux my_application.cc not found: {MY_APP_CC}')

def update_pubspec(name, description):
    if os.path.exists(PUBSPEC):
        with open(PUBSPEC, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        with open(PUBSPEC, 'w', encoding='utf-8') as f:
            for line in lines:
                if line.startswith('name: '):
                    f.write(f'name: {name}\n')
                elif line.startswith('description: '):
                    f.write(f'description: "{description}"\n')
                else:
                    f.write(line)
        print(f'Updated pubspec.yaml')
    else:
        print('pubspec.yaml not found!')

def update_android_manifest(name):
    if os.path.exists(ANDROID_MANIFEST):
        with open(ANDROID_MANIFEST, 'r', encoding='utf-8') as f:
            content = f.read()
        # Only update hardcoded android:label and package
        content = re.sub(r'android:label="[^"]*"', f'android:label="{name}"', content)
        with open(ANDROID_MANIFEST, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated AndroidManifest.xml app label')
    else:
        print(f'AndroidManifest.xml not found: {ANDROID_MANIFEST}')

def update_plist(plist_path, name):
    if os.path.exists(plist_path):
        tree = ET.parse(plist_path)
        root = tree.getroot()
        for i, elem in enumerate(root.iter()):
            if elem.tag == 'key' and elem.text in ['CFBundleName', 'CFBundleDisplayName']:
                next_elem = list(root.iter())[i+1]
                next_elem.text = name
        tree.write(plist_path, encoding='utf-8', xml_declaration=True)
        print(f'Updated {plist_path} (CFBundleName, CFBundleDisplayName)')
    else:
        print(f'Plist not found: {plist_path}')

# --- USER INPUT ---
print('\n--- App Metadata Update ---')
name = input('Enter app name: ').strip()
description = input('Enter app description: ').strip()
app_id = input('Enter application id (e.g. com.example.vnsutra): ').strip()

update_windows_metadata(name, description)
update_linux_cmakelists(name, app_id)
update_linux_myappcc(name)
update_pubspec(name, description)
update_android_manifest(name)
update_plist(MACOS_PLIST, name)
update_plist(IOS_PLIST, name)

print('\nDone!')
