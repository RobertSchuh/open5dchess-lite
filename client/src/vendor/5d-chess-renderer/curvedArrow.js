import { Bezier } from 'bezier-js';

import * as utilsFuncs from './utils.js';
import * as positionFuncs from './position.js';
class CurvedArrow {
  /*
    Arrow Object:
      - type - string ('move', 'check', or 'custom') or number for custom
      - split - boolean
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
    var splitCurve = this.arrowObject.split;
    var startCoordinates = positionFuncs.toCoordinates(this.arrowObject.start, this.global);
    var endCoordinates = positionFuncs.toCoordinates(this.arrowObject.end, this.global);

    //Update only if needed
    if(
      hasMiddle !== this.hasMiddle ||
      splitCurve !== this.splitCurve ||
      positionFuncs.compare(startCoordinates, this.startCoordinates) !== 0 ||
      positionFuncs.compare(endCoordinates, this.endCoordinates) !== 0 ||
      this.lutInterval !== this.global.configStore.get('arrow').lutInterval ||
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
      this.splitCurve = splitCurve;
      this.startCoordinates = startCoordinates;
      this.endCoordinates = endCoordinates;
      this.lutInterval = this.global.configStore.get('arrow').lutInterval;
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
  draw(progress, graphics, startCoordinates, endCoordinates, hasMiddle, middleCoordinates, splitCurve) {
    //Generate bezier curve
    var bezierObject;
    var LUT = [];
    if(splitCurve && hasMiddle) {
      //Calculating all possible control points (1,2 for start to middle and 3,4 for middle to end)
      //Dir indicates vector direction (-1, 0, or 1)
      var c1 = {
        x: startCoordinates.square.center.x,
        y: middleCoordinates.square.center.y
      };
      c1.dir = {
        x: c1.x - middleCoordinates.square.center.x,
        y: c1.y - middleCoordinates.square.center.y,
      };
      if(c1.dir.x < 0) { c1.dir.x = -1; }
      if(c1.dir.x > 0) { c1.dir.x = 1; }
      if(c1.dir.y < 0) { c1.dir.y = -1; }
      if(c1.dir.y > 0) { c1.dir.y = 1; }
      var c2 = {
        x: middleCoordinates.square.center.x,
        y: startCoordinates.square.center.y
      };
      c2.dir = {
        x: c2.x - middleCoordinates.square.center.x,
        y: c2.y - middleCoordinates.square.center.y,
      };
      if(c2.dir.x < 0) { c2.dir.x = -1; }
      if(c2.dir.x > 0) { c2.dir.x = 1; }
      if(c2.dir.y < 0) { c2.dir.y = -1; }
      if(c2.dir.y > 0) { c2.dir.y = 1; }
      var c3 = {
        x: endCoordinates.square.center.x,
        y: middleCoordinates.square.center.y
      };
      c3.dir = {
        x: c3.x - middleCoordinates.square.center.x,
        y: c3.y - middleCoordinates.square.center.y,
      };
      if(c3.dir.x < 0) { c3.dir.x = -1; }
      if(c3.dir.x > 0) { c3.dir.x = 1; }
      if(c3.dir.y < 0) { c3.dir.y = -1; }
      if(c3.dir.y > 0) { c3.dir.y = 1; }
      var c4 = {
        x: middleCoordinates.square.center.x,
        y: endCoordinates.square.center.y
      };
      c4.dir = {
        x: c4.x - middleCoordinates.square.center.x,
        y: c4.y - middleCoordinates.square.center.y,
      };
      if(c4.dir.x < 0) { c4.dir.x = -1; }
      if(c4.dir.x > 0) { c4.dir.x = 1; }
      if(c4.dir.y < 0) { c4.dir.y = -1; }
      if(c4.dir.y > 0) { c4.dir.y = 1; }

      //Possibly not needed, maybe only distance testing is needed, but left here since it works anyways (don't fix what ain't broke)
      var testPoints = (p1, p2) => {
        var res = 0;
        //Control point is inaccurate if same as middle point
        if(p1.dir.x === 0 && p1.dir.y === 0) { res--; }
        if(p2.dir.x === 0 && p2.dir.y === 0) { res--; }
        //Don't use if control points lie in the same direction from the middle point since this produces a big crease
        if(p1.dir.x !== 0 && p1.dir.x === p2.dir.x) { res -= 2; }
        if(p1.dir.y !== 0 && p1.dir.y === p2.dir.y) { res -= 2; }
        //Prefer if control points are on the same axis
        if(p1.dir.x === 0 && p1.dir.x === p2.dir.x) { res++; }
        if(p1.dir.y === 0 && p1.dir.y === p2.dir.y) { res++; }
        return res;
      }
      var distancePoints = (p1, p2) => {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
      }

      //Find best control point combination
      var control1 = c1;
      var control2 = c3;
      var testRes = testPoints(c1,c3);
      var distanceRes = distancePoints(c1,c3);
      if(testPoints(c1,c4) > testRes) {
        control1 = c1;
        control2 = c4;
        testRes = testPoints(c1,c4);
        distanceRes = distancePoints(c1,c4);
      }
      else if(testPoints(c1,c4) === testRes && distancePoints(c1,c4) > distanceRes) {
        control1 = c1;
        control2 = c4;
        testRes = testPoints(c1,c4);
        distanceRes = distancePoints(c1,c4);
      }
      if(testPoints(c2,c3) > testRes) {
        control1 = c2;
        control2 = c3;
        testRes = testPoints(c2,c3);
        distanceRes = distancePoints(c2,c3);
      }
      else if(testPoints(c2,c3) === testRes && distancePoints(c2,c3) > distanceRes) {
        control1 = c2;
        control2 = c3;
        testRes = testPoints(c2,c3);
        distanceRes = distancePoints(c2,c3);
      }
      if(testPoints(c2,c4) > testRes) {
        control1 = c2;
        control2 = c4;
        testRes = testPoints(c2,c4);
        distanceRes = distancePoints(c2,c4);
      }
      else if(testPoints(c2,c4) === testRes && distancePoints(c2,c4) > distanceRes) {
        control1 = c2;
        control2 = c4;
        testRes = testPoints(c2,c4);
        distanceRes = distancePoints(c2,c4);
      }
      
      var bezierObject1 = new Bezier(
        {
          x: startCoordinates.square.center.x,
          y: startCoordinates.square.center.y
        },
        control1,
        {
          x: middleCoordinates.square.center.x,
          y: middleCoordinates.square.center.y
        }
      );
      var bezierObject2 = new Bezier(
        {
          x: middleCoordinates.square.center.x,
          y: middleCoordinates.square.center.y
        },
        control2,
        {
          x: endCoordinates.square.center.x,
          y: endCoordinates.square.center.y
        }
      );
      var totalLength = bezierObject1.length() + bezierObject2.length();
      LUT = [];
      LUT[0] = bezierObject1.getLUT(Math.ceil(totalLength / this.global.configStore.get('arrow').lutInterval));
      LUT[1] = bezierObject2.getLUT(Math.ceil(totalLength / this.global.configStore.get('arrow').lutInterval));
      LUT = LUT.flat();
    }
    else {
      if(hasMiddle) {
        bezierObject = Bezier.quadraticFromPoints(
          {
            x: startCoordinates.square.center.x,
            y: startCoordinates.square.center.y
          },
          {
            x: middleCoordinates.square.center.x,
            y: middleCoordinates.square.center.y
          },
          {
            x: endCoordinates.square.center.x,
            y: endCoordinates.square.center.y
          }
        );
        var totalLength = bezierObject.length();
        LUT = bezierObject.getLUT(Math.ceil(totalLength / this.global.configStore.get('arrow').lutInterval));
      }
      else {
        var distanceX = Math.abs(startCoordinates.square.center.x - endCoordinates.square.center.x);
        var distanceY = Math.abs(startCoordinates.square.center.y - endCoordinates.square.center.y);
        var control = {
          x: startCoordinates.square.center.x,
          y: endCoordinates.square.center.y
        };
        if(distanceX > distanceY) {
          control.x = endCoordinates.square.center.x;
          control.y = startCoordinates.square.center.y;
        }
        bezierObject = new Bezier(
          {
            x: startCoordinates.square.center.x,
            y: startCoordinates.square.center.y
          },
          control,
          {
            x: endCoordinates.square.center.x,
            y: endCoordinates.square.center.y
          }
        );
        var totalLength = bezierObject.length();
        LUT = bezierObject.getLUT(Math.ceil(totalLength / this.global.configStore.get('arrow').lutInterval));
      }
    }

    //Get closest T from progress
    var targetT = -1;
    for(var i = 1;targetT < 0 && i <= LUT.length;i++) {
      var currT = i / LUT.length;
      var currLength = 0;
      if(splitCurve && hasMiddle) {
        var totalLength = bezierObject1.length() + bezierObject2.length();
        currLength = totalLength * currT;
      }
      else {
        currLength = bezierObject.split(0, currT).length();
      }
      if(totalLength * progress <= currLength) {
        targetT = currT;
      }
    }
    if(targetT < 0) { targetT = 1; }
    var step = Math.ceil(targetT * (LUT.length - 1));

    //TODO: Fix edge cases producing weird arrowhead
    //Generate arrowhead source point
    var targetArrowheadT = -1;
    var arrowheadPoint;
    for(var i = 1;targetArrowheadT < 0 && i <= LUT.length;i++) {
      var currT = i / LUT.length;
      var currLength = 0;
      if(splitCurve && hasMiddle) {
        var totalLength = bezierObject1.length() + bezierObject2.length();
        currLength = totalLength * (targetT - currT);
      }
      else {
        currLength = bezierObject.split(currT, targetT).length();
      }
      if(currLength <= this.global.configStore.get('arrow').headSize) {
        targetArrowheadT = currT;
        arrowheadPoint = LUT[i];
      }
    }
    if(targetArrowheadT < 0) {
      targetArrowheadT = 0.985;
      arrowheadPoint = LUT[Math.floor(LUT.length * targetArrowheadT)];
    }

    graphics.clear();
    if(step > 0) {
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
        LUT[0].x,
        LUT[0].y
      );
      for(var i = 1;i <= step;i++) {
        graphics.lineTo(
          LUT[i].x,
          LUT[i].y
        );
      }
      this.drawArrowhead(this.outlineColor, graphics, arrowheadPoint, LUT[step]);
      if(hasMiddle && step > LUT.length / 2) {
        graphics.beginFill(this.outlineColor);
        graphics.drawCircle(
          middleCoordinates.square.center.x,
          middleCoordinates.square.center.y,
          this.global.configStore.get('arrow').midpointRadius
        );
        graphics.endFill();
      }

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
        LUT[0].x,
        LUT[0].y
      );
      for(var i = 1;i <= step;i++) {
        graphics.lineTo(
          LUT[i].x,
          LUT[i].y
        );
      }
      this.drawArrowhead(this.color, graphics, arrowheadPoint, LUT[step]);
      if(hasMiddle && step > LUT.length / 2) {
        graphics.beginFill(this.color);
        graphics.drawCircle(
          middleCoordinates.square.center.x,
          middleCoordinates.square.center.y,
          this.global.configStore.get('arrow').midpointRadius
        );
        graphics.endFill();
      }
    }
  }
  wipeIn() {
    //Waiting for deleting to be done
    this.wipeProgress = 0;
    this.wipeDelay = 0;
    this.wipeLeft = this.global.configStore.get('arrow').animateDuration;
    if(this.isCustom) { this.wipeLeft = 0; }
    this.wipeDuration = this.wipeLeft;
    if(this.wipeDelay <= 0 && this.wipeLeft <=0) { this.wipeInAnimate(1); }
    else {
      this.global.app.ticker.add(this.wipeInAnimate, this);
      this.global.debug.addActive({ key: utilsFuncs.arrowObjectKey(this.arrowObject) + '_curved_wipein', type: 'ticker' });
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
          this.draw(this.wipeProgress, this.graphics, this.startCoordinates, this.endCoordinates, this.hasMiddle, this.middleCoordinates, this.splitCurve);
        }
        this.global.app.ticker.remove(this.wipeInAnimate, this);
        this.global.debug.removeActive({ key: utilsFuncs.arrowObjectKey(this.arrowObject) + '_curved_wipein', type: 'ticker' });
      }
      else {
        this.wipeProgress = (this.wipeDuration - this.wipeLeft) / this.wipeDuration;
        if(this.startCoordinates) {
          this.draw(this.wipeProgress, this.graphics, this.startCoordinates, this.endCoordinates, this.hasMiddle, this.middleCoordinates, this.splitCurve);
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
    this.tmpSplitCurve = this.splitCurve;
    this.splitCurve = undefined;
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
      this.global.debug.addActive({ key: utilsFuncs.arrowObjectKey(this.arrowObject) + '_curved_wipeout', type: 'ticker' });
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
        this.global.debug.removeActive({ key: utilsFuncs.arrowObjectKey(this.arrowObject) + '_curved_wipeout', type: 'ticker' });
      }
      else {
        this.wipeProgress = 1 - ((this.wipeDuration - this.wipeLeft) / this.wipeDuration);
        this.draw(this.wipeProgress, this.tmpGraphics, this.tmpStartCoordinates, this.tmpEndCoordinates, this.tmpHasMiddle, this.tmpMiddleCoordinates, this.tmpSplitCurve);
      }
    }
  }
}

export default CurvedArrow;