import BlackBishop from './assets/black_bishop.png';
import BlackBrawn from './assets/black_brawn.png';
import BlackCommonKing from './assets/black_common_king.png';
import BlackDragon from './assets/black_dragon.png';
import BlackKing from './assets/black_king.png';
import BlackKnight from './assets/black_knight.png';
import BlackPawn from './assets/black_pawn.png';
import BlackPrincess from './assets/black_princess.png';
import BlackQueen from './assets/black_queen.png';
import BlackRook from './assets/black_rook.png';
import BlackRoyalQueen from './assets/black_brawn.png';
import BlackUnicorn from './assets/black_unicorn.png';
import WhiteBishop from './assets/white_bishop.png';
import WhiteBrawn from './assets/white_brawn.png';
import WhiteCommonKing from './assets/white_common_king.png';
import WhiteDragon from './assets/white_dragon.png';
import WhiteKing from './assets/white_king.png';
import WhiteKnight from './assets/white_knight.png';
import WhitePawn from './assets/white_pawn.png';
import WhitePrincess from './assets/white_princess.png';
import WhiteQueen from './assets/white_queen.png';
import WhiteRook from './assets/white_rook.png';
import WhiteRoyalQueen from './assets/white_brawn.png';
import WhiteUnicorn from './assets/white_unicorn.png';
class Textures {
  constructor(PIXI, customTexture = null) {
    this.PIXI = PIXI;
    //Set mipmap to always on
    this.PIXI.settings.MIPMAP_TEXTURES = this.PIXI.MIPMAP_MODES.ON;
    
    //Store textures here
    this.textures = {};

    //Load board / square / highlight textures
    this.textures.highlight = this.PIXI.Texture.WHITE.castToBaseTexture();
    this.textures.whiteSquare = this.PIXI.Texture.WHITE.castToBaseTexture();
    this.textures.blackSquare = this.PIXI.Texture.WHITE.castToBaseTexture();
    this.textures.whiteBoardBorder = this.PIXI.Texture.WHITE.castToBaseTexture();
    this.textures.blackBoardBorder = this.PIXI.Texture.WHITE.castToBaseTexture();
    this.textures.checkBoardBorder = this.PIXI.Texture.WHITE.castToBaseTexture();
    this.textures.inactiveBoardBorder = this.PIXI.Texture.WHITE.castToBaseTexture();
    
    //Load black pieces
    this.textures.blackP = this.PIXI.BaseTexture.from(BlackPawn);
    this.textures.blackW = this.PIXI.BaseTexture.from(BlackBrawn);
    this.textures.blackB = this.PIXI.BaseTexture.from(BlackBishop);
    this.textures.blackN = this.PIXI.BaseTexture.from(BlackKnight);
    this.textures.blackR = this.PIXI.BaseTexture.from(BlackRook);
    this.textures.blackQ = this.PIXI.BaseTexture.from(BlackQueen);
    this.textures.blackS = this.PIXI.BaseTexture.from(BlackPrincess);
    this.textures.blackK = this.PIXI.BaseTexture.from(BlackKing);
    this.textures.blackC = this.PIXI.BaseTexture.from(BlackCommonKing);
    this.textures.blackY = this.PIXI.BaseTexture.from(BlackRoyalQueen);
    this.textures.blackU = this.PIXI.BaseTexture.from(BlackUnicorn);
    this.textures.blackD = this.PIXI.BaseTexture.from(BlackDragon);
    
    //Load white pieces
    this.textures.whiteP = this.PIXI.BaseTexture.from(WhitePawn);
    this.textures.whiteW = this.PIXI.BaseTexture.from(WhiteBrawn);
    this.textures.whiteB = this.PIXI.BaseTexture.from(WhiteBishop);
    this.textures.whiteN = this.PIXI.BaseTexture.from(WhiteKnight);
    this.textures.whiteR = this.PIXI.BaseTexture.from(WhiteRook);
    this.textures.whiteS = this.PIXI.BaseTexture.from(WhitePrincess);
    this.textures.whiteQ = this.PIXI.BaseTexture.from(WhiteQueen);
    this.textures.whiteK = this.PIXI.BaseTexture.from(WhiteKing);
    this.textures.whiteC = this.PIXI.BaseTexture.from(WhiteCommonKing);
    this.textures.whiteY = this.PIXI.BaseTexture.from(WhiteRoyalQueen);
    this.textures.whiteU = this.PIXI.BaseTexture.from(WhiteUnicorn);
    this.textures.whiteD = this.PIXI.BaseTexture.from(WhiteDragon);

    if(customTexture !== null) {
      let keys = Object.keys(customTexture);
      for(let key of keys) {
        this.set(key, customTexture[key]);
      }
    }
  }
  set(key, data) {
    this.textures[key] = this.PIXI.Texture.from(data).castToBaseTexture();
  }
  get(key) {
    return new this.PIXI.Texture(this.textures[key]);
  }
  destroy() {
    var keys = Object.keys(this.textures);
    for(let key of keys) {
      if(typeof this.textures[key] !== 'undefined') {
        this.textures[key].destroy();
      }
    }
    this.textures = {};
  }
}

export default Textures;