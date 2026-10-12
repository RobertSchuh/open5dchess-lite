import deepcopy from 'deepcopy';
import deepmerge from 'deepmerge';

class Config {
  constructor(customConfig = null) {
    this.config = {
      app: {
        resolution: 0,                        //Render scale: 0 = auto (devicePixelRatio). Set 2-3 manually if the browser spoofs devicePixelRatio (privacy modes).
                                              //This option will only be used on creation (reload to apply).
        height: 600,                          //This option will only be used on creation, updating this value will not resize the renderer
                                              //Use this for when not attaching the canvas element to a HTMLElement (server-side, headless, etc.). No need to change if used normally.
        width: 800,                           //This option will only be used on creation, updating this value will not resize the renderer
                                              //Use this for when not attaching the canvas element to a HTMLElement (server-side, headless, etc.). No need to change if used normally.
        preserveDrawingBuffer: false,         //This option will only be used on creation, updating this will not change PIXI.Application instance behavior
                                              //Enables drawing buffer preservation, enable this if you need to call toDataUrl on the WebGL context.
        antialias: true,                      //This option will only be used on creation, updating this will not change PIXI.Application instance behavior
                                              //Sets antialias option inside PIXI.Application constructor (see https://pixijs.download/dev/docs/PIXI.Application.html#constructor)
        forceCanvas: false,                   //This option will only be used on creation, updating this will not change PIXI.Application instance behavior
                                              //Forces the usage of canvas based rendering instead of webgl. Using canvas based rendering is not recommended, as many effects such as transparency and blur do not work correctly.
        backgroundAlpha: 1,                   //Sets alpha of the solid background (does not effect squares background)
                                              //This option will only be used on creation, updating this will not change PIXI.Application instance behavior
        interactive: true,                    //Enables mouse / touch events
      },
      viewport: {
        drag: true,                           //Enables viewport mouse / touch drag (https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html#drag)
        dragOptions: {                        //Options object for viewport drag plugin (https://davidfig.github.io/pixi-viewport/jsdoc/global.html#DragOptions)
          direction: 'all',
          pressDrag: true,
          wheel: true,
          wheelScroll: 1,
          reverse: false,
          clampWheel: false,
          underflow: 'center',
          factor: 1,
          mouseButtons: 'all',
        },
        pinch: true,                          //Enables viewport two-finger zoom / touch drag (https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html#pinch)
        pinchOptions: {                       //Options object for viewport pinch plugin (https://davidfig.github.io/pixi-viewport/jsdoc/global.html#PinchOptions)
          noDrag: false,
          percent: 1,
          factor: 1,
        },
        wheel: true,                          //Enables mouse wheel zoom (https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html#wheel)
        wheelOptions: {                       //Options object for viewport wheel plugin (https://davidfig.github.io/pixi-viewport/jsdoc/global.html#WheelOptions)
          percent: 0.1,
          smooth: false,
          reverse: false,
        },
        decelerate: true,                     //Enables move deceleration (https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html#decelerate)
        decelerateOptions: {                  //Options object for viewport decelerate plugin (https://davidfig.github.io/pixi-viewport/jsdoc/global.html#DecelerateOptions)
          friction: 0.95,
          bounce: 0.8,
          minSpeed: 0.01,
        },
        bounce: true,                         //Enables bouncing on borders (https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html#bounce)
        bounceOptions: {                      //Options object for viewport bounce plugin (https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html#bounce)
          sides: 'all',
          friction: 0.75,
          time: 150,
          ease: 'easeInOutSine',
          underflow: 'center',
        },
        clampZoom: true,                      //Enables clamping zoom on viewport (https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html#clampZoom)
        clampZoomHeightFactor: 1.1,           //Factor for multiply with full board height during zoom clamping
        clampZoomWidthFactor: 1.1,            //Factor for multiply with full board width during zoom clamping
        snapOptions: {                        //Options object during viewport snap move (https://davidfig.github.io/pixi-viewport/jsdoc/global.html#SnapOptions)
          friction: 0.8,
          time: 1000,
          ease: 'easeInOutSine',
        },
        snapZoomOptions: {                    //Options object during viewport snap zooming (https://davidfig.github.io/pixi-viewport/jsdoc/global.html#SnapZoomOptions)
          time: 1000,
          ease: 'easeInOutSine',
        }
      },
      fps: {
        show: false,                          //Enables FPS counter
        fpsTextOptions: {                     //Text options for FPS counter (https://pixijs.download/dev/docs/PIXI.TextStyle.html)
          align: 'center',
          fontFamily: 'Arial',
          fontSize: 30,
          fontStyle: 'normal',
          fontWeight: 'normal',
          textBaseline: 'alphabetic',
        },
        min: 20,                              //Set minimum fps (https://pixijs.download/dev/docs/PIXI.Ticker.html#minFPS)
        max: 0,                               //Set maximum fps (https://pixijs.download/dev/docs/PIXI.Ticker.html#maxFPS)
      },
      stats: {
        show: false,                          //Enables detailed stats Counter
      },
      background: {
        showRectangle: true,                  //Show checkered rectangle background instead of solid background
        blur: true,                           //Apply blur filter on the background
        blurStrength: 3,                      //Blur strength
        blurQuality: 3,                       //Blur quality (how many gaussian blur passes to apply)
        striped: true,                        //If set to true, a background with diagonal stripes will be shown behind timelines that would be inactive.
                                              //This makes it easy to see how many inactive timelines there are and how many timelines can be created before they become inactive.
        stripeRatio: 0.333,                   //Value between `0` and `1`, representing the ratio between shaded/non-shaded areas of the striped background.
                                              //A value of `0` will cause the background to not show any stripes, a value of `1` to have the background be a flat shade of the stripe colors.
                                              //A value of `0.5` will cause the stripes to take up half of the area. Default is `0.333`.
        expandDuration: 350,                  //Duration for the non-striped expansion animation
      },
      board: {
        showWhite: true,                      //Show white turn boards
        showBlack: true,                      //Show black turn boards
        marginHeight: 160,                    //Board margin height
        marginWidth: 160,                     //Board margin width
        borderHeight: 50,                     //Board border height
        borderWidth: 50,                      //Board border width
        borderRadius: 45,                     //Board border radius (for rounded rectangle)
        borderLineWidth: 12,                  //Board border outline width
        flipTimeline: false,                  //Flip the boards along the timelines axis
        flipTurn: false,                      //Flip the boards along the turn axis
        flipRank: false,                      //Flip the pieces / squares along the rank axis
        flipFile: false,                      //Flip the pieces / squares along the file axis
        slideBoard: false,                    //Enables the sliding board animation
        fadeDuration: 450,                    //Duration for the fade in / fade out animation
        showGhost: true,                      //Show ghost board
        ghostAlpha: 0.4,                      //Alpha value for ghost board
        showPresentBlink: true,               //Enable blinking animation for present board
        blinkDuration: 350,                   //Duration each blink cycle
      },
      boardLabel: {
        showTimeline: true,                   //Show timeline labels
        showMiddleTimeline: false,            //Show timeline labels in the middle boards
        rotateTimelineLabel: true,            //Rotate timeline labels 90 degrees
        timelineTextOptions: {                //Text options for timeline labels (https://pixijs.download/dev/docs/PIXI.TextStyle.html)
          align: 'center',
          fontFamily: 'Times New Roman',
          fontSize: 96,
          fontStyle: 'italic',
          fontWeight: 'bold',
          textBaseline: 'alphabetic',
        },
        showTurn: true,                       //Show turn labels
        turnTextOptions: {                    //Text options for turn labels (https://pixijs.download/dev/docs/PIXI.TextStyle.html)
          align: 'center',
          fontFamily: 'Times New Roman',
          fontSize: 96,
          fontStyle: 'italic',
          fontWeight: 'bold',
          textBaseline: 'alphabetic',
        },
        showFile: true,                       //Show file labels
        fileTextOptions: {                    //Text options for file labels (https://pixijs.download/dev/docs/PIXI.TextStyle.html)
          align: 'center',
          fontFamily: 'Times New Roman',
          fontSize: 36,
          fontStyle: 'normal',
          fontWeight: 'bold',
          textBaseline: 'alphabetic',
        },
        showRank: true,                       //Show rank labels
        rankTextOptions: {                    //Text options for rank labels (https://pixijs.download/dev/docs/PIXI.TextStyle.html)
          align: 'center',
          fontFamily: 'Times New Roman',
          fontSize: 36,
          fontStyle: 'normal',
          fontWeight: 'bold',
          textBaseline: 'alphabetic',
        },
        fadeDuration: 250,                    //Duration for fade in / fade out animation
      },
      boardShadow: {
        show: true,                           //Show board shadow
        offsetX: 40,                          //Offset x position
        offsetY: 40,                          //Offset y position
        alpha: 0.25,                          //Alpha value of the board shadow
      },
      promotion: {
        borderHeight: 30,                     //Promotion menu border height
        borderWidth: 30,                      //Promotion menu border width
        borderRadius: 28,                     //Promotion menu border radius (for rounded rectangle)
        borderLineWidth: 8,                   //Promotion menu border outline width
        fadeDuration: 150,                    //Duration for fade in / fade out animation
      },
      promotionShadow: {
        show: true,                           //Show promotion menu shadow
        offsetX: 25,                          //Offset x position
        offsetY: 25,                          //Offset y position
        alpha: 0.25,                          //Alpha value of the promotion menu shadow
      },
      square: {
        height: 100,                          //Board square height
        width: 100,                           //Board square width
        fadeDuration: 150,                    //Duration for fade in / fade out animation
      },
      piece: {
        height: 90,                           //Piece height height
        width: 90,                            //Piece height width
        fadeDuration: 150,                    //Duration for fade in / fade out animation
        roundPixel: true,                     //Disable pixel interpolation (https://pixijs.download/dev/docs/PIXI.settings.html#ROUND_PIXELS)
      },
      arrow: {
        lutInterval: 10,                      //Bezier lookup table density, only applies to curved arrows (http://pomax.github.io/bezierjs/#getLUT)
        headSize: 35,                         //Arrowhead size
        size: 12,                             //Arrow line width
        midpointRadius: 11,                   //Radius of the middle point
        outlineSize: 22,                      //Arrow outline width
        animateDuration: 650,                 //Duration for arrow animations (animate in and out)
        alpha: 0.6,                           //Alpha value of the arrow
        showSpatial: false,                   //Show spatial move arrows
        spatialCurved: true,                  //Use curved arrows for spatial moves
        spatialSplitCurve: false,             //Split the curved arrow into two bezier curves
        spatialMiddle: false,                 //Draw arrow with middle point
        spatialRealEnd: false,                //Use the real end position of a 5d-chess-js move object
        showNonSpatial: true,                 //Show non-spatial move arrows
        nonSpatialCurved: true,               //Use curved arrows for non-spatial moves
        nonSpatialSplitCurve: true,           //Split the curved arrow into two bezier curves
        nonSpatialMiddle: true,               //Draw arrow with middle point
        nonSpatialRealEnd: true,              //Use the real end position of a 5d-chess-js move object
        showCheck: true,                      //Show check arrows
        checkCurved: true,                    //Use curved arrows for check arrows
        showCustom: true,                     //Show custom arrows
        customCurved: false,                  //Use curved arrows for custom arrows
        customSplitCurve: true,               //Split the curved arrow into two bezier curves
        customMiddleCurved: true,             //Use curved arrows for custom arrows (in middle mode)
        customMiddleSplitCurve: true,         //Split the curved arrow into two bezier curves (in middle mode)
      },
      highlight: {
        hoverAlpha: 0.4,                      //Alpha value for available move highlight (while hovering)
        pastHoverAlpha: 0.2,                  //Alpha value for past available move highlight (while hovering)
        selectedAlpha: 0.6,                   //Alpha value for available move highlight (while selected)
        pastSelectedAlpha: 0.4,               //Alpha value for past available move highlight (while selected)
        legalPieceAlpha: 0.45,                //Alpha value for highlights on pieces with a legal move (open5dchess)
        lastMoveAlpha: 0.5,                   //Alpha value for highlights marking the opponent's last action (open5dchess)
        fadeDuration: 75,                     //Duration for fade in / fade out animation
      },
      ripple: {
        timelineDuration: 0,                  //Delay for ripple animation (increasing by timeline)
        turnDuration: 0,                      //Delay for ripple animation (increasing by turn)
        rankDuration: 15,                     //Delay for ripple animation (increasing by rank)
        fileDuration: 15,                     //Delay for ripple animation (increasing by file)
      },
      selector: {
        deselectOnMove: true,                 //Deselect piece on move selection
      },
    };

    if(customConfig !== null) {
      this.set(customConfig);
    }
  }
  set(key, value = null) {
    if(value === null) {
      this.config = deepmerge(this.config, deepcopy(key));
    }
    else {
      this.config[key] = deepmerge(this.config[key], deepcopy(value));
    }
  }
  get(key = null) {
    if(key === null) {
      return this.config;
    }
    return this.config[key];
  }
}

export default Config;