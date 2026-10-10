import * as positionFuncs from './position.js';
import * as utilsFuncs from './utils.js';
const OMEGA = 1e24;

import deepequal from 'fast-deep-equal';

class Background {
  constructor(global) {
    this.global = global;
    this.layer = this.global.layers.layers.background;
    this.blurFilter = new this.global.PIXI.filters.BlurFilter(0,0);
    this.layer.filters = [this.blurFilter];
    this.emitter = this.global.emitter;
    this.sprite = null;
    this.spriteStripedWhite = null; // Hard to pronounce :)
    this.spriteStripedBlack = null;
    this.spriteStripedPast = null;
    this.texture = null;
    this.textureStripedWhite = null;
    this.textureStripedBlack = null;
    this.textureStripedPast = null;
    this.baseWidth = 0;
    this.baseHeight = 0;
    this.activeLow = null;
    this.activeHigh = null;
    this.presentX = null;
    this.twoBoards = true; // True if there are two boards per turn, false otherwise
    this.flipTimeline = false;
    this.stripeRatio = 0.0; // See documentation in config.js
    this.emitter = this.global.emitter;
    this.update();

    this.listeners = [
      this.emitter.on('boardUpdate', this.update.bind(this)),
      this.emitter.on('configUpdate', this.update.bind(this)),
      this.emitter.on('paletteUpdate', this.update.bind(this))
    ];
  }
  refresh() {
    this.destroy(false);
    this.update();
  }
  update() {
    //Skip if board is not defined
    if(typeof this.global.boardObject === 'undefined') { return null; }

    if(this.global.configStore.get('background').blur) {
      this.blurFilter.blur = this.global.configStore.get('background').blurStrength;
      this.blurFilter.quality = this.global.configStore.get('background').blurQuality;
    }
    else {
      this.blurFilter.blur = 0;
      this.blurFilter.quality = 1;
    }
    var coordinates = positionFuncs.toCoordinates({
      timeline: 0,
      turn: 1,
      player: 'white',
      coordinate: 'a1',
      rank: 1,
      file: 1
    }, this.global);
    if(
      positionFuncs.compare(coordinates, this.coordinates) !== 0 ||
      !deepequal(this.configBackground, this.global.configStore.get('background')) ||
      !deepequal(this.paletteBackground, this.global.paletteStore.get('background')) ||
      (this.global.configStore.get('board').showWhite === this.global.configStore.get('board').showBlack) !== this.twoBoards ||
      this.flipTimeline !== this.global.configStore.get('board').flipTimeline ||
      (this.global.configStore.get('background').stripeRatio !== this.stripeRatio)
    ) {
      this.destroy(false);
      this.coordinates = coordinates;
      this.configBackground = this.global.configStore.get('background');
      this.paletteBackground = this.global.paletteStore.get('background');
      this.twoBoards = this.global.configStore.get('board').showWhite === this.global.configStore.get('board').showBlack;
      this.flipTimeline = this.global.configStore.get('board').flipTimeline;

      this.baseWidth = this.coordinates.boardWithMargins.width * (this.twoBoards ? 2 : 1);
      this.baseHeight = this.coordinates.boardWithMargins.height;
      this.stripeRatio = this.global.configStore.get('background').stripeRatio;
    }

    // Generate texture if needed

    // Base background texture
    if(this.texture === null) {
      var graphics = new this.global.PIXI.Graphics();
      graphics.beginFill(this.global.paletteStore.get('background').darkRectangle);
      graphics.drawRect(0, 0, this.baseWidth * 2, this.baseHeight * 2);
      graphics.endFill();
      graphics.beginFill(this.global.paletteStore.get('background').lightRectangle);
      graphics.drawRect(this.baseWidth * 0, this.baseHeight * 1, this.baseWidth, this.baseHeight);
      graphics.drawRect(this.baseWidth * 1, this.baseHeight * 0, this.baseWidth, this.baseHeight);
      graphics.endFill();
      if(typeof graphics.generateCanvasTexture === 'function') {
        this.texture = graphics.generateCanvasTexture();
      }
      else {
        this.texture = this.global.app.renderer.generateTexture(graphics);
      }
      graphics.destroy();
    }

    // Used to generate the striped background textures for either player
    let generateStripedTexture = (whiteColor, blackColor) => {
      var graphics = new this.global.PIXI.Graphics();
      graphics.beginFill(this.global.paletteStore.get('background').darkRectangle);
      graphics.drawRect(0, 0, this.baseWidth * 2, this.baseHeight * 2);
      graphics.endFill();
      graphics.beginFill(this.global.paletteStore.get('background').lightRectangle);
      graphics.drawRect(this.baseWidth * 0, this.baseHeight * 1, this.baseWidth, this.baseHeight);
      graphics.drawRect(this.baseWidth * 1, this.baseHeight * 0, this.baseWidth, this.baseHeight);
      graphics.endFill();

      // Board half-width, used for stripes
      var stripe_w = this.baseWidth / (this.twoBoards ? 4 : 2);
      // Board half-height, used for stripes
      var stripe_h = this.baseHeight / 2;
      // Stripe width at its intersection with background tile borders; the actual width will be `stripe_delta / √2`
      const stripe_delta = this.baseWidth / (this.twoBoards ? 4 : 2) * this.stripeRatio;
      const stripe_delta_2 = stripe_delta / this.baseWidth * this.baseHeight * (this.twoBoards ? 2 : 1);

      for (let n = 0; n < 4; n++) {
        let sx = (n % 2) * this.baseWidth;
        let sy = (n >> 1) * this.baseHeight;

        // Maybe add new palette entries
        if(n === 0 || n === 3) {
          graphics.beginFill(blackColor);
        }
        else {
          graphics.beginFill(whiteColor);
        }

        // Polygon time!
        // See https://cdn.discordapp.com/attachments/810644929754824734/812268140993314846/Screenshot_2021-02-19_11-23-24.png

        if (this.twoBoards) {
          // Stripe A, two boards per turn
          graphics.drawPolygon([
            [0, stripe_h - stripe_delta_2],
            [stripe_w - stripe_delta, 0],
            [stripe_w + stripe_delta, 0],
            [0, stripe_h + stripe_delta_2],
          ].map(([x, y]) => new this.global.PIXI.Point(sx + x, sy + y)));

          // Stripe B, two boards per turn
          graphics.drawPolygon([
            [stripe_w - stripe_delta, 2 * stripe_h],
            [stripe_w + stripe_delta, 2 * stripe_h],
            [3 * stripe_w + stripe_delta, 0],
            [3 * stripe_w - stripe_delta, 0],
          ].map(([x, y]) => new this.global.PIXI.Point(sx + x, sy + y)));

          // Stripe C, two boards per turn
          graphics.drawPolygon([
            [3 * stripe_w - stripe_delta, 2 * stripe_h],
            [3 * stripe_w + stripe_delta, 2 * stripe_h],
            [4 * stripe_w, stripe_h + stripe_delta_2],
            [4 * stripe_w, stripe_h - stripe_delta_2],
          ].map(([x, y]) => new this.global.PIXI.Point(sx + x, sy + y)));
        } else {
          // Stripe A, one board per turn
          graphics.drawPolygon([
            [0, stripe_h - stripe_delta_2],
            [stripe_w - stripe_delta, 0],
            [stripe_w + stripe_delta, 0],
            [0, stripe_h + stripe_delta_2],
          ].map(([x, y]) => new this.global.PIXI.Point(sx + x, sy + y)));

          // Stripe B, one board per turn
          graphics.drawPolygon([
            [stripe_w - stripe_delta, 2 * stripe_h],
            [stripe_w + stripe_delta, 2 * stripe_h],
            [2 * stripe_w, stripe_h + stripe_delta_2],
            [2 * stripe_w, stripe_h - stripe_delta_2],
          ].map(([x, y]) => new this.global.PIXI.Point(sx + x, sy + y)));
        }
        graphics.endFill();
      }
      var res = null;
      if(typeof graphics.generateCanvasTexture === 'function') {
        res = graphics.generateCanvasTexture();
        graphics.destroy();
        return res;
      }
      res = this.global.app.renderer.generateTexture(graphics);
      graphics.destroy();
      return res;
    };

    // Generate black's striped background
    if (this.textureStripedBlack === null) {
      this.textureStripedBlack = generateStripedTexture(
        this.global.paletteStore.get('background').lightStripeBlack,
        this.global.paletteStore.get('background').darkStripeBlack,
      );
    }

    // Generate white's striped background
    if (this.textureStripedWhite === null) {
      this.textureStripedWhite = generateStripedTexture(
        this.global.paletteStore.get('background').lightStripeWhite,
        this.global.paletteStore.get('background').darkStripeWhite,
      );
    }

    // Generate past striped background
    if (this.textureStripedPast === null) {
      this.textureStripedPast = generateStripedTexture(
        this.global.paletteStore.get('background').lightStripePast,
        this.global.paletteStore.get('background').darkStripePast,
      );
    }

    // Drawing background stripes

    // Turn black's striped background into a sprite
    if(this.spriteStripedBlack === null && this.global.configStore.get('background').striped && this.global.configStore.get('background').showRectangle) {
      this.spriteStripedBlack = new this.global.PIXI.TilingSprite(
        this.textureStripedBlack,
        this.baseWidth * 250,
        this.baseHeight * 500
      );
      this.spriteStripedBlack.anchor.set(0.5, this.flipTimeline ? 0 : 1);
      this.spriteStripedBlack.x = this.coordinates.boardWithMargins.x;
      this.spriteStripedBlack.y = this.coordinates.boardWithMargins.y;
      this.layer.addChild(this.spriteStripedBlack);
    } else if (
      this.spriteStripedBlack &&
      (
        !this.global.configStore.get('background').striped
        || !this.global.configStore.get('background').showRectangle
      )
    ) {
      this.layer.removeChild(this.spriteStripedBlack);
      this.spriteStripedBlack.destroy();
      this.spriteStripedBlack = null;
    }

    // Turn white's striped background into a sprite
    if(this.spriteStripedWhite === null && this.global.configStore.get('background').striped && this.global.configStore.get('background').showRectangle) {
      this.spriteStripedWhite = new this.global.PIXI.TilingSprite(
        this.textureStripedWhite,
        this.baseWidth * 250,
        this.baseHeight * 500
      );
      this.spriteStripedWhite.anchor.set(0.5, this.flipTimeline ? 1 : 0);
      this.spriteStripedWhite.x = this.coordinates.boardWithMargins.x;
      this.spriteStripedWhite.y = this.coordinates.boardWithMargins.y;
      this.layer.addChild(this.spriteStripedWhite);
    } else if (
      this.spriteStripedWhite &&
      (
        !this.global.configStore.get('background').striped
        || !this.global.configStore.get('background').showRectangle
      )
    ) {
      this.layer.removeChild(this.spriteStripedWhite);
      this.spriteStripedWhite.destroy();
      this.spriteStripedWhite = null;
    }

    // Turn the main background into a sprite
    if(this.sprite === null && this.global.configStore.get('background').showRectangle) {
      this.sprite = new this.global.PIXI.TilingSprite(
        this.texture,
        this.baseWidth * 250,
        this.baseHeight * 250
      );
      this.sprite.anchor.set(0.5, 0.5);
      this.sprite.x = this.coordinates.boardWithMargins.x;
      this.sprite.y = this.coordinates.boardWithMargins.y;
      this.layer.addChild(this.sprite);
    } else if (this.sprite !== null && !this.global.configStore.get('background').showRectangle) {
      this.layer.removeChild(this.sprite);
      this.sprite.destroy();
      this.sprite = null;
    }

    // Turn past striped background into a sprite
    if(this.spriteStripedPast === null && this.global.configStore.get('background').striped && this.global.configStore.get('background').showRectangle) {
      this.spriteStripedPast = new this.global.PIXI.TilingSprite(
        this.textureStripedPast,
        this.baseWidth * 500,
        this.baseHeight * 250
      );
      this.spriteStripedPast.anchor.set(0, 0.5);
      this.spriteStripedPast.x = -(this.baseWidth * 251);
      this.spriteStripedPast.y = this.coordinates.boardWithMargins.y;
      this.layer.addChild(this.spriteStripedPast);
    } else if (
      this.spriteStripedPast &&
      (
        !this.global.configStore.get('background').striped
        || !this.global.configStore.get('background').showRectangle
      )
    ) {
      this.layer.removeChild(this.spriteStripedPast);
      this.spriteStripedPast.destroy();
      this.spriteStripedPast = null;
    }

    // "Mask" the non-striped layer to only show it on the active timelines
    if (this.global.configStore.get('background').striped && this.global.boardObject && this.global.configStore.get('background').showRectangle) {
      let minTimeline = Math.min();
      let maxTimeline = Math.max();

      for (let timeline of this.global.boardObject.timelines) {
        minTimeline = Math.min(minTimeline, timeline.timeline);
        maxTimeline = Math.max(maxTimeline, timeline.timeline);
      }

      let activeLow = -maxTimeline - 1;
      let activeHigh = -minTimeline + 1;

      if (this.flipTimeline) {
        activeLow = minTimeline - 1;
        activeHigh = maxTimeline + 1;
      }

      if(this.activeLow !== activeLow || this.activeHigh !== activeHigh) {
        this.prevActiveLow = this.activeLow;
        this.prevActiveHigh = this.activeHigh;
        this.activeLow = activeLow;
        this.activeHigh = activeHigh;

        if(this.prevActiveLow === null || this.prevActiveHigh === null) {
          this.sprite.y = this.coordinates.boardWithMargins.height * this.activeLow;
          this.sprite.height = this.coordinates.boardWithMargins.height * (this.activeHigh - this.activeLow + 1);
          this.sprite.anchor.set(0.5,0);
          if(Math.abs(this.activeLow) % 2 === 0) { this.sprite.tilePosition.set(0,0); }
          else { this.sprite.tilePosition.set(0, this.coordinates.boardWithMargins.height); }
          //Past striped sprite
          this.spriteStripedPast.y = this.coordinates.boardWithMargins.height * this.activeLow;
          this.spriteStripedPast.height = this.coordinates.boardWithMargins.height * (this.activeHigh - this.activeLow + 1);
          this.spriteStripedPast.anchor.set(0,0);
          if(Math.abs(this.activeLow) % 2 === 0) { this.spriteStripedPast.tilePosition.set(0,0); }
          else { this.spriteStripedPast.tilePosition.set(0, this.coordinates.boardWithMargins.height); }
        }
        else {
          //Trigger expansion animation
          this.expandLeft = this.global.configStore.get('background').expandDuration * Math.abs(Math.abs(this.activeHigh - this.activeLow) - Math.abs(this.prevActiveHigh - this.prevActiveLow));
          this.expandDuration = this.expandLeft;
          this.global.app.ticker.add(this.expandAnimate, this);
          this.global.debug.addActive({ key: 'background_expansion', type: 'ticker' });
        }
      }
    }

    //"Mask" with past striped sprite to show present vs past
    if (this.global.configStore.get('background').striped && this.global.boardObject && this.global.configStore.get('background').showRectangle) {
      var presentTurn = utilsFuncs.presentTurn(this.global.boardObject);
      var presentCoords = positionFuncs.toCoordinates({
        timeline: 0,
        turn: presentTurn.turn,
        player: presentTurn.player,
        coordinate: 'a1',
        rank: 1,
        file: 1
      }, this.global);

      var presentX = presentCoords.boardWithMargins.x;
      if(this.presentX !== presentX) {
        this.prevPresentX = this.presentX;
        this.presentX = presentX;

        if(this.prevPresentX === null) {
          this.spriteStripedPast.width = this.presentX - this.spriteStripedPast.x;
        }
        else {
          //Trigger past expansion animation
          this.expandPastLeft = this.global.configStore.get('background').expandDuration * (Math.abs(this.presentX - this.prevPresentX) / this.coordinates.boardWithMargins.width);
          this.expandPastDuration = this.expandPastLeft;
          this.global.app.ticker.add(this.expandPastAnimate, this);
          this.global.debug.addActive({ key: 'background_past_expansion', type: 'ticker' });
        }
      }
    }
  }
  expandAnimate(delta) {
    if (!this.sprite) return;

    this.expandLeft -= (delta / 60) * 1000;
    if(this.expandLeft <= 0) {
      this.expandLeft = 0;
      this.sprite.y = this.coordinates.boardWithMargins.height * this.activeLow;
      this.sprite.height = this.coordinates.boardWithMargins.height * (this.activeHigh - this.activeLow + 1);
      this.sprite.anchor.set(0.5,0);
      if(Math.abs(this.activeLow) % 2 === 0) { this.sprite.tilePosition.set(0,0); }
      else { this.sprite.tilePosition.set(0, this.coordinates.boardWithMargins.height); }
      //Past striped sprite
      if(this.spriteStripedPast) {
        this.spriteStripedPast.y = this.coordinates.boardWithMargins.height * this.activeLow;
        this.spriteStripedPast.height = this.coordinates.boardWithMargins.height * (this.activeHigh - this.activeLow + 1);
        this.spriteStripedPast.anchor.set(0,0);
        if(Math.abs(this.activeLow) % 2 === 0) { this.spriteStripedPast.tilePosition.set(0,0); }
        else { this.spriteStripedPast.tilePosition.set(0, this.coordinates.boardWithMargins.height); }
      }
      this.global.app.ticker.remove(this.expandAnimate, this);
      this.global.debug.removeActive({ key: 'background_expansion', type: 'ticker' });
    }
    else {
      var progress = (this.expandDuration - this.expandLeft) / this.expandDuration;
      var prevHeight = (this.prevActiveHigh - this.prevActiveLow + 1);
      var height = (this.activeHigh - this.activeLow + 1);
      this.sprite.y = this.coordinates.boardWithMargins.height * (this.prevActiveLow + ((this.activeLow - this.prevActiveLow) * progress));
      this.sprite.height = this.coordinates.boardWithMargins.height * (prevHeight + ((height - prevHeight) * progress));
      this.sprite.anchor.set(0.5,0);
      this.sprite.tilePosition.set(0,-this.sprite.y);
      //Past striped sprite
      if(this.spriteStripedPast) {
        this.spriteStripedPast.y = this.coordinates.boardWithMargins.height * (this.prevActiveLow + ((this.activeLow - this.prevActiveLow) * progress));
        this.spriteStripedPast.height = this.coordinates.boardWithMargins.height * (prevHeight + ((height - prevHeight) * progress));
        this.spriteStripedPast.anchor.set(0,0);
        this.spriteStripedPast.tilePosition.set(0,-this.spriteStripedPast.y);
      }
    }
  }
  expandPastAnimate(delta) {
    if (!this.spriteStripedPast) return;

    this.expandPastLeft -= (delta / 60) * 1000;
    if(this.expandPastLeft <= 0) {
      this.expandPastLeft = 0;
      this.spriteStripedPast.width = this.presentX - this.spriteStripedPast.x;
      this.global.app.ticker.remove(this.expandPastAnimate, this);
      this.global.debug.removeActive({ key: 'background_past_expansion', type: 'ticker' });
    }
    else {
      var progress = (this.expandPastDuration - this.expandPastLeft) / this.expandPastDuration;
      var prevWidth = this.prevPresentX - this.spriteStripedPast.x;
      var width = this.presentX - this.spriteStripedPast.x;
      this.spriteStripedPast.width = prevWidth + ((width - prevWidth) * progress);
    }
  }
  destroy(removeListeners = true) {
    this.coordinates = undefined;
    this.baseWidth = 0;
    this.baseHeight = 0;
    this.prevActiveLow = null;
    this.prevActiveHigh = null;
    this.prevPresentX = null;
    this.activeLow = null;
    this.activeHigh = null;
    this.presentX = null;
    if(this.texture !== null) {
      this.texture.destroy(true);
      this.texture = null;
    }
    if(this.sprite !== null) {
      this.sprite.destroy();
      this.sprite = null;
    }
    if(this.textureStripedBlack !== null) {
      this.textureStripedBlack.destroy(true);
      this.textureStripedBlack = null;
    }
    if(this.spriteStripedBlack !== null) {
      this.spriteStripedBlack.destroy();
      this.spriteStripedBlack = null;
    }
    if(this.textureStripedWhite !== null) {
      this.textureStripedWhite.destroy(true);
      this.textureStripedWhite = null;
    }
    if(this.spriteStripedWhite !== null) {
      this.spriteStripedWhite.destroy();
      this.spriteStripedWhite = null;
    }
    if(this.textureStripedPast !== null) {
      this.textureStripedPast.destroy(true);
      this.textureStripedPast = null;
    }
    if(this.spriteStripedPast !== null) {
      this.spriteStripedPast.destroy();
      this.spriteStripedPast = null;
    }
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
}

export default Background;