class Layers {
  constructor(PIXI, viewport) {
    this.layers = {
      viewport: null,
      root: new PIXI.Container(),
      background: new PIXI.Container(),
      board: new PIXI.Container(),
      present: new PIXI.Container(),
      boardBorder: new PIXI.Container(),
      squares: new PIXI.Container(),
      labels: new PIXI.Container(),
      pieces: new PIXI.Container(),
      squareHighlights: new PIXI.Container(),
      moveArrows: new PIXI.Container(),
      customArrows: new PIXI.Container(),
      promotionMenu: new PIXI.Container(),
    };

    this.layers.root.addChild(this.layers.background);
    this.layers.background.interactiveChildren = false;

    this.layers.root.addChild(this.layers.board);
    this.layers.root.addChild(this.layers.present);
    this.layers.present.interactiveChildren = false;
    
    this.layers.root.addChild(this.layers.boardBorder);
    this.layers.boardBorder.interactiveChildren = false;

    this.layers.root.addChild(this.layers.squares);
    this.layers.root.addChild(this.layers.labels);
    this.layers.labels.interactiveChildren = false;

    this.layers.root.addChild(this.layers.pieces);
    this.layers.root.addChild(this.layers.squareHighlights);
    this.layers.root.addChild(this.layers.moveArrows);
    this.layers.moveArrows.interactiveChildren = false;

    this.layers.root.addChild(this.layers.customArrows);
    this.layers.customArrows.interactiveChildren = false;

    this.layers.root.addChild(this.layers.promotionMenu);

    this.layers.viewport = viewport;
    this.layers.viewport.addChild(this.layers.root);
  }
}

export default Layers;