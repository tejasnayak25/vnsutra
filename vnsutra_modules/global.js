let game, 
gameSettings = {
    text_animation: true
}, exitApp = () => {
    window.closeApp?.() || history.back();
}, bgm = () => {
    document.getElementById("music").play();
}, autoplay = false, is_app = false;
let activeScene = undefined, activeLayer = 'home', configuration = null;
let state = {};
let instruction_count = 0;

document.oncontextmenu = (e) => {
    e.preventDefault();
}

document.addEventListener("keydown", (e) => {
    if(e.ctrlKey && e.shiftKey) {
        switch(e.key) {
            case "I": e.preventDefault();break;
            case "J": e.preventDefault();break;
            case "C": e.preventDefault();break;
            default: break;
        }
    }
    if(e.ctrlKey && (["n", "o", "s", "r", "u"].find(item => item === e.key.toLowerCase()))) {
        e.preventDefault();
    }
    if(e.key === "F12") {
        e.preventDefault();
    }
});