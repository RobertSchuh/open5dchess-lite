import * as PIXI from 'pixi.js-legacy';
import { Viewport } from 'pixi-viewport';
import Cull from 'pixi-cull';

import { throttle } from 'throttle-debounce';
import elementResizeEvent from 'element-resize-event';
import { createNanoEvents } from 'nanoevents';

import Textures from './textures.js';
import Config from './config.js';
import Palette from './palette.js';
import Layers from './layers.js';
import Text from './text.js';
import Debug from './debug.js';
import * as utilsFuncs from './utils.js';
class Global {
  constructor(customConfig = null, customPalette = null, customPIXI = null, customTexture = null) {
    //Allow custom PIXI library
    this.PIXI = PIXI;
    if(customPIXI !== null) {
      this.PIXI = customPIXI;
    }

    //New event emitter instance
    this.emitter = createNanoEvents();

    //New Texture Manager
    this.textureStore = new Textures(this.PIXI, customTexture);

    //Allow custom configuration
    this.configStore = new Config(customConfig);

    //Allow custom palette
    this.paletteStore = new Palette(customPalette);

    //New Text Manager
    this.textStore = new Text(this.PIXI);

    //HTML Element
    this.element = null;

    //Debug manager
    this.debug = new Debug();

    //Create PIXI app
    this.app = new this.PIXI.Application({
      sharedLoader: false,
      width: this.configStore.get('app').width,
      height: this.configStore.get('app').height,
      preserveDrawingBuffer: this.configStore.get('app').preserveDrawingBuffer,
      antialias: this.configStore.get('app').antialias,
      forceCanvas: this.configStore.get('app').forceCanvas,
      backgroundAlpha: this.configStore.get('app').backgroundAlpha,
      powerPreference: 'high-performance'
    });
    this.app.renderer.plugins.interaction.moveWhenInside = true;

    //Create Viewport and add to app
    this.viewport = new Viewport({
      passiveWheel: false,
      disableOnContextMenu: true,
      //Map touch/pointer positions through PIXI's interaction manager instead
      //of raw clientX/Y; without this, multi-touch pinch uses wrong
      //coordinates whenever the canvas is offset or scaled.
      interaction: this.app.renderer.plugins.interaction,
    });
    this.viewport.options.disableOnContextMenu = true;
    this.app.stage.addChild(this.viewport);
    this.viewport.resize(this.app.renderer.width, this.app.renderer.height);

    //Create and attach layers
    this.layers = new Layers(this.PIXI, this.viewport);

    //Create Culling instance and bind to viewport
    this.cull = new Cull.Simple({ dirtyTest: false });
    this.cull.addList(this.layers.layers.background.children);
    this.cull.addList(this.layers.layers.present.children);
    this.cull.addList(this.layers.layers.boardBorder.children);
    this.cull.addList(this.layers.layers.squares.children);
    this.cull.addList(this.layers.layers.labels.children);
    this.cull.addList(this.layers.layers.pieces.children);
    this.cull.addList(this.layers.layers.squareHighlights.children);
    this.cull.addList(this.layers.layers.moveArrows.children);
    this.cull.addList(this.layers.layers.customArrows.children);
    this.cull.addList(this.layers.layers.promotionMenu.children);
    this.cull.cull(this.viewport.getVisibleBounds());
    this.app.ticker.add(() => {
      if(this.viewport.dirty) {
        this.cull.cull(this.viewport.getVisibleBounds());
        this.viewport.dirty = false;
      }
    }, this, this.PIXI.UPDATE_PRIORITY.LOW);

    //Contain 5d-chess-js board object
    this.preTransformBoard;
    this.boardObject;
    
    //Contain 5d-chess-js action history array
    this.actionHistoryObjects = [];

    //Contain 5d-chess-js move buffer array
    this.moveBufferObjects = [];

    //Contain 5d-chess-js checks array
    this.checkObjects = [];

    //Indicate if in custom arrow mode (will block piece and highlight updates)
    this.customArrowMode = false;

    //Contain array of 5d-chess-js move objects indicating available moves
    this.preTransformAvailableMoves = [];
    this.availableMoveObjects = [];

    //Contain array of 5d-chess-js move objects indicating past available moves
    this.preTransformPastAvailableMoves = [];
    this.pastAvailableMoveObjects = [];
    //Squares of pieces that have a legal move (open5dchess); empty = no highlights
    this.legalPieceObjects = [];

    //Object indicating piece hovered over (null if none)
    //Hovered indicates piece that is being considered for selection (but not actually selected)
    /*
      Object:
       - key: string
       - squareKey: string
       - pieceObject: object
    */
    this.hoverPiece = null;

    //Object indicating selected piece (null if none)
    /*
      Object:
       - key: string
       - squareKey: string
       - pieceObject: object
    */
    this.selectedPiece = null;

    //Trigger updates
    this.config({});
    this.palette({});
  }
  attach(element) {
    //Assign element
    this.element = element;

    //Attach PIXI app to element
    this.app.resizeTo = this.element;
    this.element.appendChild(this.app.view);
    this.viewport.resize(this.app.renderer.width, this.app.renderer.height);

    //Trigger resize on element change for viewport
    elementResizeEvent(this.element, throttle(500, () => {
      this.viewport.resize(this.app.renderer.width, this.app.renderer.height);
      this.emitter.emit('resizeEvent');
    }));

    //Fallback pinch-zoom on raw touch events. Some mobile browsers (Firefox
    //for Android) don't reliably deliver both pointers to PIXI's interaction
    //manager, so pixi-viewport's own pinch plugin never engages. These
    //listeners implement the same zoom-about-midpoint directly, but stay
    //dormant whenever pixi-viewport is already tracking two touches (Chrome).
    //preventDefault() on two-finger moves also stops browser page zoom on
    //browsers that ignore the viewport meta (iOS Safari).
    let pinchDist = null;
    let dragPaused = false;
    const touchInfo = (e) => {
      const rect = this.app.view.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      return {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        mid: { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top },
      };
    };
    //While the fallback pinch drives the zoom, the browser may still feed ONE
    //of the fingers to PIXI (that is the Firefox failure mode), making the
    //drag plugin fight the pinch and its inertia fling the board on release.
    //So: pause drag during the fallback pinch, and clear any stored fling
    //velocity when the fingers lift.
    const endPinch = (e) => {
      pinchDist = null;
      if(dragPaused && e.touches.length === 0) {
        this.viewport.plugins.resume('drag');
        dragPaused = false;
      }
      const decelerate = this.viewport.plugins.get('decelerate');
      if(decelerate) { decelerate.reset(); }
    };
    this.app.view.addEventListener('touchstart', (e) => {
      pinchDist = e.touches.length === 2 ? touchInfo(e).dist : null;
    }, { passive: true });
    this.app.view.addEventListener('touchmove', (e) => {
      if(e.touches.length !== 2) { pinchDist = null; return; }
      e.preventDefault(); //never let the browser zoom/scroll a two-finger gesture
      if(this.viewport.input.count() >= 2) { pinchDist = null; return; } //pixi pinch has it
      const { dist, mid } = touchInfo(e);
      if(pinchDist === null) { pinchDist = dist; return; }
      if(pinchDist <= 0 || dist <= 0) { return; }
      if(!dragPaused) {
        this.viewport.plugins.pause('drag');
        dragPaused = true;
      }
      const before = this.viewport.toWorld(mid.x, mid.y);
      this.viewport.scale.x *= dist / pinchDist;
      this.viewport.scale.y = this.viewport.scale.x;
      const clamp = this.viewport.plugins.get('clamp-zoom');
      if(clamp) { clamp.clamp(); }
      //Keep the point under the fingers fixed while zooming
      const after = this.viewport.toWorld(mid.x, mid.y);
      this.viewport.x += (after.x - before.x) * this.viewport.scale.x;
      this.viewport.y += (after.y - before.y) * this.viewport.scale.y;
      pinchDist = dist;
      this.viewport.emit('zoomed', { viewport: this.viewport, type: 'pinch' });
      this.viewport.emit('moved', { viewport: this.viewport, type: 'pinch' });
      this.viewport.dirty = true;
    }, { passive: false });
    this.app.view.addEventListener('touchend', endPinch, { passive: true });
    this.app.view.addEventListener('touchcancel', endPinch, { passive: true });

    //Emit element update
    this.emitter.emit('elementUpdate');
  }
  config(key, value = null, skipEmit = false) {
    this.configStore.set(key, value);
    this.app.stage.interactiveChildren = this.configStore.get('app').interactive;
    this.app.stage.interactive = this.configStore.get('app').interactive;
    this.app.ticker.minFPS = this.configStore.get('fps').min;
    this.app.ticker.maxFPS = this.configStore.get('fps').max;
    if(skipEmit) { return null; }
    this.emitter.emit('configUpdate');
  }
  palette(key, value = null, skipEmit = false) {
    this.paletteStore.set(key, value);
    this.app.renderer.backgroundColor = this.paletteStore.get('background').single;
    if(skipEmit) { return null; }
    this.emitter.emit('paletteUpdate');
  }
  texture(key, data, skipEmit = false) {
    this.textureStore.set(key, data);
    if(skipEmit) { return null; }
    this.emitter.emit('textureUpdate', key);
  }
  sync(chess) {
    //Takes 5d-chess-js object and displays it
    var tmpChess = chess.copy();
    tmpChess.skipDetection = true;
    this.board(tmpChess.board, true);
    this.actionHistory(tmpChess.actionHistory, true);
    this.moveBuffer(tmpChess.moveBuffer, true);
    this.checks(tmpChess.checks('object'), true);
    this.emitter.emit('boardUpdate', this.boardObject);
    this.emitter.emit('actionHistoryUpdate', this.actionHistoryObjects);
    this.emitter.emit('moveBufferUpdate', this.moveBufferObjects);
    this.emitter.emit('checksUpdate', this.checkObjects);
  }
  board(board, skipEmit = false) {
    this.preTransformBoard = board;
    this.boardObject = utilsFuncs.transformBoard(this.preTransformBoard, this.checkObjects);
    if(skipEmit) { return null; }
    this.emitter.emit('boardUpdate', this.boardObject);
  }
  actionHistory(actionHistory, skipEmit = false) {
    this.actionHistoryObjects = actionHistory;
    if(skipEmit) { return null; }
    this.emitter.emit('actionHistoryUpdate', this.actionHistoryObjects);
  }
  moveBuffer(moveBuffer, skipEmit = false) {
    this.moveBufferObjects = moveBuffer;
    if(skipEmit) { return null; }
    this.emitter.emit('moveBufferUpdate', this.moveBufferObjects);
  }
  checks(checks, skipEmit = false) {
    this.checkObjects = checks;
    this.boardObject = utilsFuncs.transformBoard(this.preTransformBoard, this.checkObjects);
    if(skipEmit) { return null; }
    this.emitter.emit('boardUpdate', this.boardObject);
    this.emitter.emit('checksUpdate', this.checkObjects);
  }
  availableMoves(availableMoves) {
    this.preTransformAvailableMoves = availableMoves;
    this.availableMoveObjects = utilsFuncs.transformMoves(this.preTransformAvailableMoves, true);
    this.emitter.emit('availableMovesUpdate', this.availableMoveObjects);
  }
  legalPieces(squares) {
    this.legalPieceObjects = Array.isArray(squares) ? squares : [];
    this.emitter.emit('legalPiecesUpdate', this.legalPieceObjects);
  }
  pastAvailableMoves(pastAvailableMoves) {
    this.preTransformPastAvailableMoves = pastAvailableMoves;
    this.pastAvailableMoveObjects = utilsFuncs.transformMoves(this.preTransformPastAvailableMoves, false);
    this.emitter.emit('pastAvailableMovesUpdate', this.pastAvailableMoveObjects);
  }
  destroy() {
    this.viewport.destroy();
    this.app.destroy({
      removeView: true,
      stageOptions: {
        children: true,
        texture: true,
        baseTexture: true,
      }
    });
    this.emitter.events = {};
    this.textureStore.destroy();
    this.PIXI = undefined;
  }
}

export default Global;