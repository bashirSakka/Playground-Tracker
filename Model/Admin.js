class Admin {
  constructor(id, username, pass) {
    this.id = id;
    this.username = username;
    this.pass = pass;
  }
  getId() {
    return this.id;
  }
  setId(id) {
    this.id = id;
  }
  getUsername() {
    return this.username;
  }
  setUsername(username) {
    this.username = username;
  }
  getPass() {
    return this.pass;
  }
  setPass(pass) {
    return this.pass;
  }
}
