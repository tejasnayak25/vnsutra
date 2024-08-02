let game, 
gameSettings = {
    text_animation: true
}, exitApp = () => {
    history.back();
}, bgm = () => {
    document.getElementById("music").play();
}, autoplay = false, is_app = false;
let activeScene = undefined, activeLayer = 'home', configuration = null;

document.oncontextmenu = (e) => {
    e.preventDefault();
}

document.onkeydown = (e) => {
    if(e.ctrlKey && e.shiftKey) {
        switch(e.key) {
            case "I": e.preventDefault();break;
            default: break;
        }
    }
}