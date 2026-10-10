class Debug {
  constructor() {
    this.activeInstances = [];
    this.enabled = false;
  }
  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
    this.activeInstances = [];
  }
  addActive(object) {
    if(!this.enabled) {
      return null;
    }
    let hasActive = false;
    for(let i = 0;i < this.activeInstances.length;i++) {
      let activeInstance = this.activeInstances[i];
      if(activeInstance.key === object.key) {
        hasActive = true;
      }
    }
    if(!hasActive) {
      this.activeInstances.push(object);
    }
  }
  removeActive(object) {
    if(!this.enabled) {
      return null;
    }
    for(let i = 0;i < this.activeInstances.length;i++) {
      let activeInstance = this.activeInstances[i];
      if(activeInstance.key === object.key) {
        this.activeInstances.splice(i,1);
        i--;
      }
    }
  }
  getActive(type) {
    return this.activeInstances.filter(o => o.type === type);
  }
}

export default Debug;