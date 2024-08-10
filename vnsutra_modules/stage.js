let docRect = document.body.getBoundingClientRect();

var konvaStage = new Konva.Stage({
    container: 'playground',   // id of container <div>
    width: docRect.width,
    height: docRect.height
});

let tr_layer = new Konva.Layer({
    name: "TransformerLayer"
});