import deepcopy from 'deepcopy';
import deepmerge from 'deepmerge';

class Palette {
  constructor(customPalette = null) {
    this.palette = {
      fps: {
        text: 0x000000,                       //FPS counter text color
      },
      background: {
        single: 0xE2E5F7,                     //Background color for solid backgrounds
        lightRectangle: 0xE2E5F7,             //Color for light rectangles of checkered background
        lightStripeBlack: 0xBCB6CE,           //Color for black side stripes on light rectangles of the checkered background
        lightStripeWhite: 0xE5EEF6,           //Color for white side stripes on light rectangles of the checkered background
        lightStripePast: 0xdddddd,            //Color for past side stripes on light rectangles of the checkered background
        darkRectangle: 0xCED4F1,              //Color for dark rectangles of the checkered background
        darkStripeBlack: 0xAFA3BD,            //Color for black side stripes on dark rectangles of the checkered background
        darkStripeWhite: 0xDDE5F4,            //Color for white side stripes on dark rectangles of the checkered background
        darkStripePast: 0xbbbbbb,             //Color for past side stripes on dark rectangles of the checkered background
      },
      board: {
        whiteBorder: 0xdddddd,                //Tint for white board borders
        blackBorder: 0x222222,                //Tint for black board borders
        checkBorder: 0xc50000,                //Tint for board borders that are involved in checks
        inactiveBorder: 0x777777,             //Tint for boards that are inactive
        whiteBorderOutline: 0x222222,         //Color of outlines of white boards
        blackBorderOutline: 0xdddddd,         //Color of outlines of black boards
        checkBorderOutline: 0xaf0000,         //Color of outlines of boards involved in checks
        inactiveBorderOutline: 0x777777,      //Color of outlines of inactive boards
      },
      boardLabel: {
        timeline: 0x000000,                   //Color of timeline labels
        turn: 0x000000,                       //Color of turn labels
        whiteBoard: 0x000000,                 //Color of board labels on white board
        blackBoard: 0xffffff,                 //Color of board labels on black board
        checkBoard: 0xffffff,                 //Color of board labels on boards involved in checks
        inactiveBoard: 0xffffff,              //Color of board labels on inactive boards
      },
      boardShadow: {
        shadow: 0x000000,                     //Color of board shadows
      },
      square: {
        white: 0xbababa,                      //Tint for white square
        black: 0x868686,                      //Tint for black square
      },
      arrow: {
        move: 0xd3a026,                       //Color of move arrows
        moveOutline: 0x000000,                //Color of move arrow outlines
        check: 0xf50000,                      //Color of check arrows
        checkOutline: 0x000000,               //Color of check arrow outlines
        custom: 0x32dcfa,                     //Color of custom arrows
                                              //This is the default color used if no color is specified when turning on custom arrow mode
        customOutline: 0x000000,              //Color of custom arrow outlines
      },
      highlight: {
        self: 0x0083be,                       //Tint for square highlights on selected pieces
        move: 0x6fc326,                       //Tint for square highlights on available moves
        pastMove: 0x6fc326,                   //Tint for square highlights on past available moves
        capture: 0xf50000,                    //Tint for square highlights on available capture moves
        pastCapture: 0xf50000,                //Tint for square highlights on past available capture moves
        legalPiece: 0xf5b800,                 //Tint for square highlights on pieces with a legal move (open5dchess)
        lastMove: 0x3d9bf0,                   //Tint for square highlights marking the opponent's last action (open5dchess)
      }
    };

    if(customPalette !== null) {
      this.set(customPalette);
    }
  }
  set(key, value = null) {
    if(value === null) {
      this.palette = deepmerge(this.palette, deepcopy(key));
    }
    else {
      this.palette[key] = deepmerge(this.palette[key], deepcopy(value));
    }
  }
  get(key = null) {
    if(key === null) {
      return this.palette;
    }
    return this.palette[key];
  }
}

export default Palette;