import * as positionFuncs from './position.js';
import deepcopy from 'deepcopy';

class PromotionMenu {
  constructor(global, moveObject = null) {
    this.global = global;

    this.layer = new this.global.PIXI.Container();
    this.layers = {
      promotionShadow: new this.global.PIXI.Container(),
      promotion: new this.global.PIXI.Container(),
      pieces: new this.global.PIXI.Container(),
    };
    this.global.layers.layers.promotionMenu.addChild(this.layer);
    this.layer.addChild(this.layers.promotionShadow);
    this.layer.addChild(this.layers.promotion);
    this.layer.addChild(this.layers.pieces);
    this.alphaFilter = new this.global.PIXI.filters.AlphaFilter();
    this.layer.filters = [this.alphaFilter];

    this.emitter = this.global.emitter;
    this.moveObject = {};
    this.pieceSprites = [];
    if(moveObject !== null) {
      this.update(moveObject);
    }

    this.listeners = [
      this.emitter.on('configUpdate', this.refresh.bind(this)),
      this.emitter.on('paletteUpdate', this.refresh.bind(this)),
      this.emitter.on('textureUpdate', (key = null) => {
        let updatePiece = false;
        if(this.pieceObject.piece === '') { this.pieceObject.piece = 'P'; }
        if(key === (this.pieceObject.player + this.pieceObject.piece)) {
          updatePiece = true;
        }
        if(key === 'square' || key === 'piece' || key === 'all' || key === null) {
          this.refresh();
        }
      })
    ];
  }
  refresh() {
    this.destroy(false);
    this.update(this.moveObject);
  }
  update(moveObject) {
    //Assign moveObject to instance variables
    this.moveObject = moveObject;

    var coordinates = positionFuncs.toCoordinates(this.moveObject.end, this.global);
    //Load and animate board if needed
    if(positionFuncs.compare(coordinates, this.coordinates) !== 0) {
      this.coordinates = coordinates;
      //Clear old stuff if needing to update
      if(typeof this.graphics !== 'undefined') {
        this.destroy(false);
      }
      this.graphics = new this.global.PIXI.Graphics();
      if(this.moveObject.player === 'white') {
        this.graphics.beginTextureFill({
          texture: this.global.textureStore.get(`whiteBoardBorder`),
          color: this.global.paletteStore.get('board').whiteBorder,
        });
        this.graphics.lineStyle({
          width: this.global.configStore.get('promotion').borderLineWidth,
          color: this.global.paletteStore.get('board').whiteBorderOutline,
          alignment: 0
        });
      }
      else {
        this.graphics.beginTextureFill({
          texture: this.global.textureStore.get(`blackBoardBorder`),
          color: this.global.paletteStore.get('board').blackBorder,
        });
        this.graphics.lineStyle({
          width: this.global.configStore.get('promotion').borderLineWidth,
          color: this.global.paletteStore.get('board').blackBorderOutline,
          alignment: 0
        });
      }
      var newBox = {
        x: this.coordinates.square.x,
        y: this.coordinates.square.y,
        width: this.coordinates.square.width,
        height: this.coordinates.square.height * this.moveObject.promotion.length,
      };
      var promotionPieces = this.moveObject.promotion; //Store available promotions
      if(this.coordinates.square.y > this.coordinates.board.y + this.coordinates.board.height / 2) {
        //Square is in bottom half of board
        newBox.y -= this.coordinates.square.height * (this.moveObject.promotion.length - 1);
        promotionPieces = [];
        for(var i = this.moveObject.promotion.length - 1;i >= 0;i--) {
          promotionPieces.push(this.moveObject.promotion[i]);
        }
      }
      this.graphics.drawRoundedRect(
        newBox.x - this.global.configStore.get('promotion').borderWidth,
        newBox.y - this.global.configStore.get('promotion').borderHeight,
        newBox.width + (this.global.configStore.get('promotion').borderWidth * 2),
        newBox.height + (this.global.configStore.get('promotion').borderHeight * 2),
        this.global.configStore.get('promotion').borderRadius
      );
      //Draw box with same texture and color as original square
      if(this.moveObject.end.rank % 2 === this.moveObject.end.file % 2) {
        this.graphics.beginTextureFill({
          texture: this.global.textureStore.get(`whiteSquare`),
          color: this.global.paletteStore.get('square').white,
        });
      }
      else {
        this.graphics.beginTextureFill({
          texture: this.global.textureStore.get(`blackSquare`),
          color: this.global.paletteStore.get('square').black,
        });
      }
      this.graphics.lineStyle({ width: 0 });
      this.graphics.drawRect(newBox.x, newBox.y, newBox.width, newBox.height);
      this.graphics.endFill();

      //Draw shadow
      if(this.global.configStore.get('promotionShadow').show) {
        this.shadowGraphics = new this.global.PIXI.Graphics();
        this.shadowGraphics.beginFill(this.global.paletteStore.get('boardShadow').shadow);
        this.shadowGraphics.drawRoundedRect(
          (newBox.x - this.global.configStore.get('promotion').borderWidth) + this.global.configStore.get('promotionShadow').offsetX,
          (newBox.y - this.global.configStore.get('promotion').borderHeight) + this.global.configStore.get('promotionShadow').offsetY,
          newBox.width + (this.global.configStore.get('promotion').borderWidth * 2),
          newBox.height + (this.global.configStore.get('promotion').borderHeight * 2),
          this.global.configStore.get('promotion').borderRadius
        );
        this.shadowGraphics.endFill();
        this.shadowGraphics.alpha = this.global.configStore.get('promotionShadow').alpha;
        this.layers.promotionShadow.addChild(this.shadowGraphics);
      }
      else {
        if(typeof this.shadowGraphics !== 'undefined') { this.shadowGraphics.destroy(); }
      }
      this.layers.promotion.addChild(this.graphics);

      //Draw piece sprites
      for(var i = 0;i < promotionPieces.length;i++) {
        var currPiece = promotionPieces[i];
        var currPieceSprite = new this.global.PIXI.Sprite(this.global.textureStore.get(`${this.moveObject.player}${currPiece}`));
        currPieceSprite.width = this.coordinates.square.height;
        currPieceSprite.height = this.coordinates.square.width;
        currPieceSprite.x = newBox.x;
        currPieceSprite.y = newBox.y + (this.coordinates.square.height * i);
        currPieceSprite.roundPixels = this.global.configStore.get('piece').roundPixel;
        currPieceSprite.interactive = true;
        currPieceSprite.hitArea = new this.global.PIXI.Rectangle(0, 0, this.coordinates.square.width, this.coordinates.square.height);
        var newMove = deepcopy(this.moveObject);
        newMove.promotion = currPiece;
        currPieceSprite.moveData = newMove;
        currPieceSprite.on('pointertap', (event) => {
          this.emitter.emit('moveSelect', event.target.moveData);
        });
        this.layers.pieces.addChild(currPieceSprite);
        this.pieceSprites.push(currPieceSprite);
      }

      //Trigger promotion menu exit
      this.layer.interactive = true;
      this.layer.on('pointerout', (event) => {
        this.emitter.emit('promotionMenuOut');
      });
      
      //Initialize animation
      this.fadeIn();
    }
  }
  fadeIn() {
    this.alphaFilter.alpha = 0;
    this.fadeLeft = this.global.configStore.get('promotion').fadeDuration;
    this.fadeDuration = this.fadeLeft;
    this.global.app.ticker.add(this.fadeInAnimate, this);
    this.global.debug.addActive({ key: 'promotion_fadein', type: 'ticker' });
  }
  fadeInAnimate(delta) {
    //Animate fading in
    if(this.fadeDelay > 0) {
      this.fadeDelay -= (delta / 60) * 1000;
      if(this.fadeDelay < 0) {
        this.fadeDelay = 0;
      }
    }
    else if(this.alphaFilter && this.alphaFilter.alpha < 1) {
      this.fadeLeft -= (delta / 60) * 1000;
      if(this.fadeLeft <= 0) {
        this.fadeLeft = 0;
        this.alphaFilter.alpha = 1;
        this.layer.x = 0;
        this.global.app.ticker.remove(this.fadeInAnimate, this);
        this.global.debug.removeActive({ key: 'promotion_fadein', type: 'ticker' });
      }
      else {
        var progress = (this.fadeDuration - this.fadeLeft) / this.fadeDuration;
        this.alphaFilter.alpha = progress;
      }
    }
  }
  destroy(removeListeners = true) {
    this.tmpAlphaFilter = this.alphaFilter;
    this.alphaFilter = undefined;
    if(typeof this.tmpGraphics !== 'undefined') {
      this.tmpGraphics.clear();
      this.tmpGraphics.destroy();
    }
    this.tmpGraphics = this.graphics;
    this.graphics = undefined;
    if(this.shadowGraphics) {
      if(typeof this.tmpShadowGraphics !== 'undefined') {
        this.tmpShadowGraphics.clear();
        this.tmpShadowGraphics.destroy();
      }
      this.tmpShadowGraphics = this.shadowGraphics;
      this.shadowGraphics = undefined;
    }
    for(var i = 0;i < this.tmpPieceSprites.length;i++) {
      if(typeof this.tmpPieceSprites[i] !== 'undefined') {
        this.tmpPieceSprites[i].destroy();
      }
    }
    this.tmpPieceSprites = this.pieceSprites.slice();
    this.pieceSprites = undefined;
    this.fadeLeft = this.global.configStore.get('promotion').fadeDuration;
    this.fadeDuration = this.fadeLeft;
    this.global.app.ticker.add(this.fadeOutAnimate, this);
    this.global.debug.addActive({ key: 'promotion_fadeout', type: 'ticker' });
    if(removeListeners) {
      if(Array.isArray(this.listeners)) {
        while(this.listeners.length > 0) {
          if(typeof this.listeners[0] === 'function') {
            this.listeners[0]();
          }
          this.listeners.splice(0,1);
        }
      }
    }
  }
  fadeOutAnimate(delta) {
    //Animate fading out
    if(this.fadeDelay > 0) {
      this.fadeDelay -= (delta / 60) * 1000;
      if(this.fadeDelay < 0) {
        this.fadeDelay = 0;
      }
    }
    else if(this.tmpAlphaFilter && this.tmpAlphaFilter.alpha > 0) {
      this.fadeLeft -= (delta / 60) * 1000;
      if(this.fadeLeft <= 0) {
        this.fadeLeft = 0;
        this.layer.filters = [];
        this.tmpGraphics.clear();
        this.tmpGraphics.destroy();
        this.tmpGraphics = undefined;
        if(this.tmpShadowGraphics) {
          this.tmpShadowGraphics.clear();
          this.tmpShadowGraphics.destroy();
          this.tmpShadowGraphics = undefined;
        }
        for(var i = 0;i < this.tmpPieceSprites.length;i++) {
          this.tmpPieceSprites[i].destroy();
          this.tmpPieceSprites[i] = undefined;
        }
        this.tmpPieceSprites = undefined;
        this.global.app.ticker.remove(this.fadeOutAnimate, this);
        this.global.debug.removeActive({ key: 'promotion_fadeout', type: 'ticker' });
      }
      else {
        this.tmpAlphaFilter.alpha = 1 - ((this.fadeDuration - this.fadeLeft) / this.fadeDuration);
      }
    }
  }
}

export default PromotionMenu;