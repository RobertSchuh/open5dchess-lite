import PromotionMenu from './promotionMenu.js';
import * as utilsFuncs from './utils.js';
import * as positionFuncs from './position.js';
class Highlight {
  constructor(global, highlightObject = null) {
    this.global = global;
    this.emitter = this.global.emitter;
    this.layer = this.global.layers.layers.squareHighlights;
    this.highlightObject = {};
    this.alpha = 0;
    this.interactive = false;
    this.promotionMenu;
    if(highlightObject !== null) {
      this.update(highlightObject);
    }
    
    this.listeners = [
      this.emitter.on('textureUpdate', (key = null) => {
        if(key === 'highlight' || key === 'all' || key === null) {
          this.refresh();
        }
      }),
      this.emitter.on('promotionMenuOut', () => {
        if(typeof this.promotionMenu !== 'undefined') {
          this.promotionMenu.destroy();
          this.promotionMenu = undefined;
        }
      })
    ];
  }
  refresh() {
    this.destroy(false);
    this.update(this.highlightObject);
  }
  update(highlightObject) {
    //Assign highlightObject to instance variables
    this.highlightObject = highlightObject;
    
    var coordinates = positionFuncs.toCoordinates(this.highlightObject, this.global);
    //Load and animate sprite if needed
    if(
      positionFuncs.compare(coordinates, this.coordinates) !== 0 ||
      this.alpha !== this.highlightObject.alpha ||
      this.color !== this.highlightObject.color ||
      this.interactive !== this.highlightObject.interactive
    ) {
      if(typeof this.sprite !== 'undefined') {
        this.destroy(false);
      }

      this.coordinates = coordinates;
      this.alpha = this.highlightObject.alpha;
      this.color = this.highlightObject.color;
      this.interactive = this.highlightObject.interactive;
      this.key = utilsFuncs.squareObjectKey(this.highlightObject);
      this.sprite = new this.global.PIXI.Sprite(this.global.textureStore.get('highlight'));
      this.sprite.tint = this.color;
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
  }
  interact() {
    //Add interactive events
    if(this.interactive) {
      this.sprite.interactive = true;
      this.sprite.on('pointertap', (event) => {
        this.emitter.emit('squareTap', {
          key: this.key,
          squareObject: this.highlightObject,
          coordinates: this.coordinates,
          sourceEvent: event
        });
        if(this.global.customArrowMode) { return null; }
        this.emitter.emit('highlightTap', {
          key: this.key,
          highlightObject: this.highlightObject,
          coordinates: this.coordinates,
          sourceEvent: event
        });
        if(typeof this.highlightObject.move !== 'undefined') {
          if(!Array.isArray(this.highlightObject.move.promotion)) {
            this.emitter.emit('moveSelect', this.highlightObject.move);
          }
        }
      });
      this.sprite.on('pointerover', (event) => {
        this.emitter.emit('squareOver', {
          key: this.key,
          squareObject: this.highlightObject,
          coordinates: this.coordinates,
          sourceEvent: event
        });
        if(this.global.customArrowMode) { return null; }
        this.emitter.emit('highlightOver', {
          key: this.key,
          highlightObject: this.highlightObject,
          coordinates: this.coordinates,
          sourceEvent: event
        });
        if(typeof this.highlightObject.move !== 'undefined') {
          if(Array.isArray(this.highlightObject.move.promotion)) {
            if(typeof this.promotionMenu === 'undefined') {
              this.promotionMenu = new PromotionMenu(this.global, this.highlightObject.move);
            }
            else {
              this.promotionMenu.update(this.highlightObject.move);
            }
          }
        }
      });
      this.sprite.on('pointerout', (event) => {
        this.emitter.emit('squareOut', {
          key: this.key,
          squareObject: this.highlightObject,
          coordinates: this.coordinates,
          sourceEvent: event
        });
        if(this.global.customArrowMode) { return null; }
        this.emitter.emit('highlightOut', {
          key: this.key,
          highlightObject: this.highlightObject,
          coordinates: this.coordinates,
          sourceEvent: event
        });
      });
    }
    else {
      this.sprite.interactive = false;
    }
  }
  fadeIn() {
    this.sprite.alpha = 0;
    this.sprite.width = 0;
    this.sprite.height = 0;
    this.fadeDelay = 0;
    this.fadeLeft = this.global.configStore.get('highlight').fadeDuration;
    this.fadeDuration = this.fadeLeft;
    this.global.app.ticker.add(this.fadeInAnimate, this, this.global.PIXI.UPDATE_PRIORITY.INTERACTION);
    this.global.debug.addActive({ key: this.key + '_highlight_fadein', type: 'ticker' });
  }
  fadeInAnimate(delta) {
    //Animate fading in
    if(this.fadeDelay > 0) {
      this.fadeDelay -= (delta / 60) * 1000;
      if(this.fadeDelay < 0) {
        this.fadeDelay = 0;
      }
    }
    else if(this.sprite && this.sprite.alpha < this.alpha) {
      this.fadeLeft -= (delta / 60) * 1000;
      if(this.fadeLeft <= 0) {
        this.fadeLeft = 0;
        this.sprite.alpha = this.alpha;
        this.sprite.width = this.coordinates.square.width;
        this.sprite.height = this.coordinates.square.height;
        this.global.app.ticker.remove(this.fadeInAnimate, this);
        this.global.debug.removeActive({ key: this.key + '_highlight_fadein', type: 'ticker' });
      }
      else {
        var progress = (this.fadeDuration - this.fadeLeft) / this.fadeDuration;
        this.sprite.alpha = this.alpha * progress;
        this.sprite.width = progress * this.coordinates.square.width;
        this.sprite.height = progress * this.coordinates.square.height;
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
    this.tmpAlpha = this.alpha;
    this.alpha = 0;
    this.tmpInteractive = this.interactive;
    this.interactive = false;
    this.fadeDelay = 0;
    this.fadeLeft = this.global.configStore.get('highlight').fadeDuration;
    this.fadeDuration = this.fadeLeft;
    this.global.app.ticker.add(this.fadeOutAnimate, this);
    this.global.debug.addActive({ key: this.key + '_highlight_fadeout', type: 'ticker' });
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
        this.tmpAlpha = undefined;
        this.tmpInteractive = undefined;
        this.global.app.ticker.remove(this.fadeOutAnimate, this);
        this.global.debug.removeActive({ key: this.key + '_highlight_fadeout', type: 'ticker' });
      }
      else {
        var progress = 1 - ((this.fadeDuration - this.fadeLeft) / this.fadeDuration);
        this.tmpSprite.alpha = this.tmpAlpha * progress;
        this.tmpSprite.width = progress * this.tmpCoordinates.square.width;
        this.tmpSprite.height = progress * this.tmpCoordinates.square.height;
      }
    }
  }
}

export default Highlight;