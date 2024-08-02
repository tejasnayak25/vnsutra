let path = require("path");
let fs = require("fs");
let express = require("express");
let app = express();
let archiver = require("archiver");

let zipDir = path.join(__dirname, "zipfiles");
if(!fs.existsSync(zipDir)) {
    fs.mkdirSync(zipDir, { recursive: true });
}

function zipFile(source_dir, dest) {
    return new Promise((resolve, reject) => {
        var output = fs.createWriteStream(dest);
        var archive = archiver('zip');
        
        output.on('close', function () {
            console.log(archive.pointer() + ' total bytes');
            console.log('archiver has been finalized and the output file descriptor has closed.');
            resolve();
        });
        
        archive.on('error', function(err){
            reject(err);
        });
        
        archive.pipe(output);
        
        archive.directory(source_dir, false);
        
        archive.finalize();
    });
}

app.use(express.static(__dirname))

app.route("/")
.get((req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.route("/service-worker.js")
.get((req, res) => {
    res.sendFile(path.join(__dirname, "service-worker.js"));
});

app.route(`/folder`)
.get(async (req, res) => {
    if(req.headers['sec-fetch-site'] === "same-origin") {
        let fpath = decodeURIComponent(req.query.path);
        let folder = path.join(__dirname, "assets", "game-assets", fpath);

        if(fs.existsSync(folder)) {
            let data = fs.statSync(folder);
            if(data.isDirectory()) {
                let zipName = fpath.split("/").join("_");

                let zipPath = path.join(zipDir, `${zipName}.zip`);
                if(!fs.existsSync(zipPath)) {
                    await zipFile(folder, zipPath);
                }

                let data = fs.readFileSync(zipPath, { encoding: "base64" });

                res.json({
                    status: 200,
                    data: data
                });
            } else {
                res.json({
                    status: 500
                });
            }
        } else {
            res.json({
                status: 404
            })
        }
    } else {
        res.status(404).end();
    }
});

app.listen(10000, () => {
    console.log("started");
});