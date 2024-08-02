import os
from urllib.parse import unquote
from flask import Flask, request, jsonify, send_from_directory
import zipfile, base64

zipDir = ""

def zipFile(src, dest):
    zip = zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED)
    
    for root, dirs, files in os.walk(src):
        for file in files:
            zip.write(os.path.join(root, file), 
                       os.path.relpath(os.path.join(root, file), 
                                       os.path.join(src, '.')))
            
    zip.close()
    

PORT = 10000

server = Flask(__name__, static_folder='', template_folder='')

@server.route("/")
def home():
    return send_from_directory(server.root_path, "index.html")

@server.route("/install/")
def install():
    return send_from_directory(os.path.join(server.root_path, "install"), "index.html")

@server.route("/service-worker.js")
def service():
    return send_from_directory(server.root_path, "service-worker.js")

@server.route("/folder")
def index():
    folder_path = request.args.get('path')
    fpath = folder_path
    if folder_path:
        folder_path = os.path.join(server.root_path, "assets", "game-assets", unquote(folder_path))
        if os.path.exists(folder_path):
            if os.path.isdir(folder_path):
                zipName = "_".join(fpath.split("/"))

                zipPath = os.path.join(zipDir, f"{zipName}.zip")

                print(zipPath)
                if not os.path.exists(zipPath):
                    zipFile(folder_path, zipPath)

                zFile = open(zipPath, "rb")
                z_file_content = zFile.read()

                data = base64.b64encode(z_file_content).decode('ascii')

                return jsonify({'status': 200, 'data': data}), 200
            else:
                return jsonify({'status': 500}), 500
        else:
            return jsonify({'status': 404}), 404
    else:
        return jsonify({'status': 400}), 400

def main():
    global zipDir
    print("serving at port", PORT)
    zipDir = os.path.join(server.root_path, "zipfiles")
    if not os.path.exists(zipDir):
        os.makedirs(zipDir)
    try:
        server.run(port=PORT, debug=False)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()