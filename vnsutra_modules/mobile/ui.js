let header = document.getElementById("main-header");

function checkMobile() {
    let width = window.innerWidth;
    let height = window.innerHeight;

    if(width < height) {
        return true;
    } else {
        return false;
    }
}

let isMobile = checkMobile();