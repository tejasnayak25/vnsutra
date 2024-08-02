function load(fpath) {
    return new Promise((resolve, reject) => {
        // Fetch and use the JSON configuration
        try {
            fetch(fpath)
            .then(response => {
                if (!response.ok) {
                    resolve(404);
                }
                resolve(response);
            })
            .catch(error => {
                resolve(404);
            });
        } catch(e) {
            resolve(404);
        }
    });
}

async function loadJSON(fpath) {
    let response = await load(fpath);
    if(response === 404) {
        return 404;
    } else {
        let json = await response.json();
        return json;
    }
}

function loadFonts(fonts, root = "./") {
    return new Promise(async (resolve, reject) => {
        let fontList = {};
        Object.entries(fonts).forEach(([ key, value ], index, arr) => {
            const font = new FontFace(value.name, `url(${root}${value.url})`);

            font.load().then(function(loadedFont) {
                document.fonts.add(loadedFont);
                fontList[key] = `'${loadedFont.family}'`;
                if(index === (arr.length - 1)) {
                    resolve(fontList);
                }
            }).catch(function(error) {
                console.error('Failed to load font:', error);
            });
        });
    });
}