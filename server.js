const express = require("express");
const path = require("path");
const http = require("http");
const app = express();
const server = http.createServer(app);
const authRoutes = require("./routes/authRoutes");
const childRoutes = require("./Routes/ChildRoutes");
const anchorRoutes = require("./Routes/AnchorRoutes");
const trackingService = require("./Tracking/trackingService");
trackingService.init(server);

// view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "View/Home"));

// middleware
app.use(express.static(path.join(__dirname, "View/Auth")));
app.use(express.static(path.join(__dirname, "View/Auth/Admin-Login")));
app.use(express.static(path.join(__dirname, "View/Home")));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
const session = require("express-session");

app.use(
  session({
    secret: "mySecretKey", // change this in real projects
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  }),
);
// routes
app.use(authRoutes);
app.use(childRoutes);
app.use(anchorRoutes);

// pages
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "View", "Auth", "Admin-Login", "Login.html"),
  );
});

app.get("/home", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/");
  }
  res.render("Home");
});

server.listen(5008, () => {
  console.log("working...");
});
