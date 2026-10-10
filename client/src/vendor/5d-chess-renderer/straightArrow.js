import { Bezier } from 'bezier-js';

import * as utilsFuncs from './utils.js';
import * as positionFuncs from './position.js';
class StraightArrow {
  /*
    Arrow Object:
      - type - string ('move', 'check', or 'custom') or number for custom
      - start - pos obj
      - middle - null or pos obj
      - end - pos obj
  */
  constructor(global, arrowObject = null) {
    this.global = global;
    if(arrowObject !== null) {
      this.update(arrowObject);
    }
  }
  update(arrowObject) {
    this.arrowObject = arrowObject;
    this.isCustom = typeof this.arrowObject.type !== 'string' || this.arrowObject.type.includes('custom');
    this.layer = this.isCustom ? this.global.layers.layers.moveArrows : this.global.layers.layers.customArrows;
    var color = typeof this.arrowObject.type === 'string' ? this.global.paletteStore.get('arrow')[this.arrowObject.type] : this.arrowObject.type;
    var outlineColor = typeof this.arrowObject.type === 'string' ? this.global.paletteStore.get('arrow')[`${this.arrowObject.type}Outline`] : 0x000000;
    var hasMiddle = this.arrowObject.middle !== null;
    var startCoordinates = positionFuncs.toCoordinates(this.arrowObject.start, this.global);
    var endCoordinates = positionFuncs.toCoordinates(this.arrowObject.end, this.global);

    //Update only if needed
    if(
      hasMiddle !== this.hasMiddle ||
      positionFuncs.compare(startCoordinates, this.startCoordinates) !== 0 ||
      positionFuncs.compare(endCoordinates, this.endCoordinates) !== 0 ||
      this.alpha !== this.global.configStore.get('arrow').alpha ||
      this.color !== color ||
      this.outlineColor !== outlineColor ||
      typeof this.graphics === 'undefined'
    ) {
      if(typeof this.graphics !== 'undefined') {
        this.destroy();
      }
      this.color = color;
      this.outlineColor = outlineColor;
      this.hasMiddle = hasMiddle;
      this.startCoordinates = startCoordinates;
      this.endCoordinates = endCoordinates;
      this.alpha = this.global.configStore.get('arrow').alpha;
      //Generate middle
      if(this.hasMiddle) {
        this.middleCoordinates = positionFuncs.toCoordinates(this.arrowObject.middle, this.global);
      }
      
      this.graphics = new this.global.PIXI.Graphics();
      this.graphics.filters = [new this.global.PIXI.filters.AlphaFilter(this.alpha)];
      this.layer.addChild(this.graphics);

      //Initialize animation
      this.wipeIn();
    }
  }
  drawArrowhead(color, graphics, sp, tp) {
    var sx = sp.x;
    var sy = sp.y;
    var tx = tp.x;
    var ty = tp.y;
    var dx = tx - sx;
    var dy = ty - sy;
    var angle = Math.atan2(dy, dx);
    var headlen = this.global.configStore.get('arrow').headSize;
    graphics.beginFill(color);
    graphics.drawPolygon([
      tx - headlen * Math.cos(angle - Math.PI / 6), ty - headlen * Math.sin(angle - Math.PI / 6),
      tx, ty,
      tx - headlen * Math.cos(angle + Math.PI / 6), ty - headlen * Math.sin(angle + Math.PI / 6)
    ]);
    graphics.endFill();
  }
  draw(progress, graphics, startCoordinates, endCoordinates, hasMiddle, middleCoordinates) {
    graphics.clear();
    if(progress > 0) {
      if(hasMiddle) {
        var firstLegLength = Math.sqrt(
          Math.pow(middleCoordinates.square.center.x - startCoordinates.square.center.x, 2) +
          Math.pow(middleCoordinates.square.center.y - startCoordinates.square.center.y, 2)
        );
        var secondLegLength = Math.sqrt(
          Math.pow(middleCoordinates.square.center.x - endCoordinates.square.center.x, 2) +
          Math.pow(middleCoordinates.square.center.y - endCoordinates.square.center.y, 2)
        );
        var totalLength = firstLegLength + secondLegLength;
        if(progress < firstLegLength / totalLength) {
          //Has not reached middle point
          var newProgress = (progress) / (firstLegLength / totalLength);
          var point = {
            x: ((middleCoordinates.square.center.x - startCoordinates.square.center.x) * newProgress) + startCoordinates.square.center.x,
            y: ((middleCoordinates.square.center.y - startCoordinates.square.center.y) * newProgress) + startCoordinates.square.center.y
          };
          
          //Draw outline
          graphics.lineStyle({
            width: this.global.configStore.get('arrow').outlineSize,
            color: this.outlineColor,
            alignment: 0.5,
            native: false,
            cap: this.global.PIXI.LINE_CAP.ROUND,
            join: this.global.PIXI.LINE_JOIN.ROUND
          });
          graphics.moveTo(
            startCoordinates.square.center.x,
            startCoordinates.square.center.y
          );
          graphics.lineTo(
            point.x,
            point.y
          );
          this.drawArrowhead(this.outlineColor, graphics, startCoordinates.square.center, point);

          //Draw arrow
          graphics.lineStyle({
            width: this.global.configStore.get('arrow').size,
            color: this.color,
            alignment: 0.5,
            native: false,
            cap: this.global.PIXI.LINE_CAP.ROUND,
            join: this.global.PIXI.LINE_JOIN.ROUND
          });
          graphics.moveTo(
            startCoordinates.square.center.x,
            startCoordinates.square.center.y
          );
          graphics.lineTo(
            point.x,
            point.y
          );
          this.drawArrowhead(this.color, graphics, startCoordinates.square.center, point);
        }
        else {
          //Has reached middle point
          var newProgress = (progress - (firstLegLength / totalLength)) / (secondLegLength / totalLength);
          var point = {
            x: ((endCoordinates.square.center.x - middleCoordinates.square.center.x) * newProgress) + middleCoordinates.square.center.x,
            y: ((endCoordinates.square.center.y - middleCoordinates.square.center.y) * newProgress) + middleCoordinates.square.center.y
          };
          
          //Draw outline
          graphics.lineStyle({
            width: this.global.configStore.get('arrow').outlineSize,
            color: this.outlineColor,
            alignment: 0.5,
            native: false,
            cap: this.global.PIXI.LINE_CAP.ROUND,
            join: this.global.PIXI.LINE_JOIN.ROUND
          });
          graphics.moveTo(
            startCoordinates.square.center.x,
            startCoordinates.square.center.y
          );
          graphics.lineTo(
            middleCoordinates.square.center.x,
            middleCoordinates.square.center.y
          );
          graphics.lineTo(
            point.x,
            point.y
          );
          graphics.beginFill(this.outlineColor);
          graphics.drawCircle(
            middleCoordinates.square.center.x,
            middleCoordinates.square.center.y,
            this.global.configStore.get('arrow').midpointRadius
          );
          graphics.endFill();
          this.drawArrowhead(this.outlineColor, graphics, middleCoordinates.square.center, point);

          //Draw arrow
          graphics.lineStyle({
            width: this.global.configStore.get('arrow').size,
            color: this.color,
            alignment: 0.5,
            native: false,
            cap: this.global.PIXI.LINE_CAP.ROUND,
            join: this.global.PIXI.LINE_JOIN.ROUND
          });
          graphics.moveTo(
            startCoordinates.square.center.x,
            startCoordinates.square.center.y
          );
          graphics.lineTo(
            middleCoordinates.square.center.x,
            middleCoordinates.square.center.y
          );
          graphics.lineTo(
            point.x,
            point.y
          );
          graphics.beginFill(this.color);
          graphics.drawCircle(
            middleCoordinates.square.center.x,
            middleCoordinates.square.center.y,
            this.global.configStore.get('arrow').midpointRadius
          );
          graphics.endFill();
          this.drawArrowhead(this.color, graphics, middleCoordinates.square.center, point);
        }
      }
      else {
        var point = {
          x: ((endCoordinates.square.center.x - startCoordinates.square.center.x) * progress) + startCoordinates.square.center.x,
          y: ((endCoordinates.square.center.y - startCoordinates.square.center.y) * progress) + startCoordinates.square.center.y
        };
        
        //Draw outline
        graphics.lineStyle({
          width: this.global.configStore.get('arrow').outlineSize,
          color: this.outlineColor,
          alignment: 0.5,
          native: false,
          cap: this.global.PIXI.LINE_CAP.ROUND,
          join: this.global.PIXI.LINE_JOIN.ROUND
        });
        graphics.moveTo(
          startCoordinates.square.center.x,
          startCoordinates.square.center.y
        );
        graphics.lineTo(
          point.x,
          point.y
        );
        this.drawArrowhead(this.outlineColor, graphics, startCoordinates.square.center, point);

        //Draw arrow
        graphics.lineStyle({
          width: this.global.configStore.get('arrow').size,
          color: this.color,
          alignment: 0.5,
          native: false,
          cap: this.global.PIXI.LINE_CAP.ROUND,
          join: this.global.PIXI.LINE_JOIN.ROUND
        });
        graphics.moveTo(
          startCoordinates.square.center.x,
          startCoordinates.square.center.y
        );
        graphics.lineTo(
          point.x,
          point.y
        );
        this.drawArrowhead(this.color, graphics, startCoordinates.square.center, point);
      }
    }
  }
  wipeIn() {
    this.wipeProgress = 0;
    this.wipeDelay = 0;
    this.wipeLeft = this.global.configStore.get('arrow').animateDuration;
    if(this.isCustom) { this.wipeLeft = 0; }
    this.wipeDuration = this.wipeLeft;
    if(this.wipeDelay <= 0 && this.wipeLeft <=0) { this.wipeInAnimate(1); }
    else {
      this.global.app.ticker.add(this.wipeInAnimate, this);
      this.global.debug.addActive({ key: utilsFuncs.arrowObjectKey(this.arrowObject) + '_straight_wipein', type: 'ticker' });
    }
  }
  wipeInAnimate(delta) {
    //Animate wipe in
    if(this.wipeDelay > 0) {
      this.wipeDelay -= (delta / 60) * 1000;
      if(this.wipeDelay < 0) {
        this.wipeDelay = 0;
      }
    }
    else {
      this.wipeLeft -= (delta / 60) * 1000;
      if(this.wipeLeft <= 0) {
        this.wipeLeft = 0;
        this.wipeProgress = 1;
        if(this.startCoordinates) {
          this.draw(this.wipeProgress, this.graphics, this.startCoordinates, this.endCoordinates, this.hasMiddle, this.middleCoordinates);
        }
        this.global.app.ticker.remove(this.wipeInAnimate, this);
        this.global.debug.removeActive({ key: utilsFuncs.arrowObjectKey(this.arrowObject) + '_straight_wipein', type: 'ticker' });
      }
      else {
        this.wipeProgress = (this.wipeDuration - this.wipeLeft) / this.wipeDuration;
        if(this.startCoordinates) {
          this.draw(this.wipeProgress, this.graphics, this.startCoordinates, this.endCoordinates, this.hasMiddle, this.middleCoordinates);
        }
      }
    }
  }
  destroy() {
    this.tmpStartCoordinates = this.startCoordinates;
    this.startCoordinates = undefined;
    this.tmpHasMiddle = this.hasMiddle;
    this.hasMiddle = undefined;
    this.tmpMiddleCoordinates = this.middleCoordinates;
    this.middleCoordinates = undefined;
    this.tmpEndCoordinates = this.endCoordinates;
    this.endCoordinates = undefined;
    if(typeof this.tmpGraphics !== 'undefined') {
      this.tmpGraphics.clear();
      this.tmpGraphics.destroy();
    }
    this.tmpGraphics = this.graphics;
    this.graphics = undefined;
    this.wipeDelay = 0;
    this.wipeLeft = this.global.configStore.get('arrow').animateDuration;
    if(this.isCustom) { this.wipeLeft = 0; }
    this.wipeDuration = this.wipeLeft;
    if(this.wipeDelay <= 0 && this.wipeLeft <=0) { this.wipeOutAnimate(1); }
    else {
      this.global.app.ticker.add(this.wipeOutAnimate, this);
      this.global.debug.addActive({ key: utilsFuncs.arrowObjectKey(this.arrowObject) + '_straight_wipeout', type: 'ticker' });
    }
  }
  wipeOutAnimate(delta) {
    //Animate wipe out
    if(this.wipeDelay > 0) {
      this.wipeDelay -= (delta / 60) * 1000;
      if(this.wipeDelay < 0) {
        this.wipeDelay = 0;
      }
    }
    else {
      this.wipeLeft -= (delta / 60) * 1000;
      if(this.wipeLeft <= 0) {
        this.wipeLeft = 0;
        this.wipeProgress = 0;
        this.tmpStartCoordinates = undefined;
        this.tmpHasMiddle = undefined;
        this.tmpMiddleCoordinates = undefined;
        this.tmpEndCoordinates = undefined;
        this.tmpGraphics.clear();
        this.tmpGraphics.destroy();
        this.tmpGraphics = undefined;
        this.global.app.ticker.remove(this.wipeOutAnimate, this);
        this.global.debug.removeActive({ key: utilsFuncs.arrowObjectKey(this.arrowObject) + '_straight_wipeout', type: 'ticker' });
      }
      else {
        this.wipeProgress = 1 - ((this.wipeDuration - this.wipeLeft) / this.wipeDuration);
        this.draw(this.wipeProgress, this.tmpGraphics, this.tmpStartCoordinates, this.tmpEndCoordinates, this.tmpHasMiddle, this.tmpMiddleCoordinates);
      }
    }
  }
}

export default StraightArrow;