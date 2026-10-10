import * as utilsFuncs from './utils.js';
import * as positionFuncs from './position.js';
class Square {
  constructor(global, squareObject = null, layer = null) {
    this.global = global;
    this.layer = this.global.layers.layers.squares;
    if(layer !== null) {
      this.layer = layer;
    }
    
    this.emitter = this.global.emitter;
    this.squareObject = {};
    if(squareObject !== null) {
      this.update(squareObject);
    }

    this.listeners = [
      this.emitter.on('textureUpdate', this.refresh.bind(this))
    ];
  }
  refresh() {
    this.destroy(false);
    this.update(this.squareObject);
  }
  update(squareObject) {
    //Assign pieceObj to instance variables
    this.squareObject = squareObject;
    
    var coordinates = positionFuncs.toCoordinates(this.squareObject, this.global);
    //Load and animate sprite if needed
    if(positionFuncs.compare(coordinates, this.coordinates) !== 0) {
      this.coordinates = coordinates;
      this.key = utilsFuncs.squareObjectKey(this.squareObject);
      if(this.squareObject.rank % 2 !== this.squareObject.file % 2) {
        this.sprite = new this.global.PIXI.Sprite(this.global.textureStore.get('whiteSquare'));
      }
      else {
        this.sprite = new this.global.PIXI.Sprite(this.global.textureStore.get('blackSquare'));
      }
      this.sprite.width = this.coordinates.square.width;
      this.sprite.height = this.coordinates.square.height;
      this.sprite.anchor.set(0.5);
      this.sprite.x = this.coordinates.square.center.x;
      this.sprite.y = this.coordinates.square.center.y;
      this.layer.addChild(this.sprite);
      //Add interaction if needed
      this.interact();
  
      //Initialize animation
      this.fadeIn();
    }
    if(this.squareObject.rank % 2 !== this.squareObject.file % 2) {
      this.sprite.tint = this.global.paletteStore.get('square').white;
    }
    else {
      this.sprite.tint = this.global.paletteStore.get('square').black;
    }
  }
  interact() {
    //Add interactive events
    this.sprite.interactive = true;
    this.sprite.on('pointertap', (event) => {
      this.emitter.emit('squareTap', {
        key: this.key,
        squareObject: this.squareObject,
        coordinates: this.coordinates,
        sourceEvent: event
      });
    });
    this.sprite.on('pointerover', (event) => {
      this.emitter.emit('squareOver', {
        key: this.key,
        squareObject: this.squareObject,
        coordinates: this.coordinates,
        sourceEvent: event
      });
    });
    this.sprite.on('pointerout', (event) => {
      this.emitter.emit('squareOut', {
        key: this.key,
        squareObject: this.squareObject,
        coordinates: this.coordinates,
        sourceEvent: event
      });
    });
  }
  fadeIn() {
    this.sprite.alpha = 0;
    this.sprite.width = 0;
    this.sprite.height = 0;
    this.fadeDelay = this.global.configStore.get('ripple').timelineDuration * Math.abs(this.squareObject.timeline);
    this.fadeDelay += this.global.configStore.get('ripple').turnDuration * ((this.squareObject.turn * 2 )+ (this.squareObject.player === 'white' ? 0 : 1));
    this.fadeDelay += this.global.configStore.get('ripple').rankDuration * this.squareObject.rank;
    this.fadeDelay += this.global.configStore.get('ripple').fileDuration * this.squareObject.file;
    this.fadeLeft = this.global.configStore.get('square').fadeDuration;
    this.fadeDuration = this.fadeLeft;
    this.global.app.ticker.add(this.fadeInAnimate, this);
    this.global.debug.addActive({ key: this.key + '_square_fadein', type: 'ticker' });
  }
  fadeInAnimate(delta) {
    //Animate fading in
    if(this.fadeDelay > 0) {
      this.fadeDelay -= (delta / 60) * 1000;
      if(this.fadeDelay < 0) {
        this.fadeDelay = 0;
      }
    }
    else if(this.sprite && this.sprite.alpha < 1) {
      this.fadeLeft -= (delta / 60) * 1000;
      if(this.fadeLeft <= 0) {
        this.fadeLeft = 0;
        this.sprite.alpha = 1;
        this.sprite.width = this.coordinates.square.width;
        this.sprite.height = this.coordinates.square.height;
        this.global.app.ticker.remove(this.fadeInAnimate, this);
        this.global.debug.removeActive({ key: this.key + '_square_fadein', type: 'ticker' });
      }
      else {
        this.sprite.alpha = (this.fadeDuration - this.fadeLeft) / this.fadeDuration;
        this.sprite.width = this.sprite.alpha * this.coordinates.square.width;
        this.sprite.height = this.sprite.alpha * this.coordinates.square.height;
      }
    }
  }
  destroy(removeListeners = true) {
    this.tmpCoordinates = this.coordinates;
    this.coordinates = undefined;
    if(typeof this.tmpSprite !== 'undefined') {
      this.tmpSprite.destroy();
    }
    this.tmpSprite = this.sprite;
    this.sprite = undefined;
    this.fadeDelay = this.global.configStore.get('ripple').timelineDuration * Math.abs(this.squareObject.timeline);
    this.fadeDelay += this.global.configStore.get('ripple').turnDuration * ((this.squareObject.turn * 2 )+ (this.squareObject.player === 'white' ? 0 : 1));
    this.fadeDelay += this.global.configStore.get('ripple').rankDuration * this.squareObject.rank;
    this.fadeDelay += this.global.configStore.get('ripple').fileDuration * this.squareObject.file;
    this.fadeLeft = this.global.configStore.get('square').fadeDuration;
    this.fadeDuration = this.fadeLeft;
    this.global.app.ticker.add(this.fadeOutAnimate, this);
    this.global.debug.addActive({ key: this.key + '_square_fadeout', type: 'ticker' });
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
    else if(this.tmpSprite && this.tmpSprite.alpha > 0) {
      this.fadeLeft -= (delta / 60) * 1000;
      if(this.fadeLeft <= 0) {
        this.fadeLeft = 0;
        this.tmpSprite.destroy();
        this.tmpSprite = undefined;
        this.tmpCoordinates = undefined;
        this.global.app.ticker.remove(this.fadeOutAnimate, this);
        this.global.debug.removeActive({ key: this.key + '_square_fadeout', type: 'ticker' });
      }
      else {
        this.tmpSprite.alpha = 1 - ((this.fadeDuration - this.fadeLeft) / this.fadeDuration);
        this.tmpSprite.width = this.tmpSprite.alpha * this.tmpCoordinates.square.width;
        this.tmpSprite.height = this.tmpSprite.alpha * this.tmpCoordinates.square.height;
      }
    }
  }
}

export default Square;