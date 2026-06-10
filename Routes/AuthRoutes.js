const express = require("express");
const router = express.Router();

const authController = require("../Controller/authController");

router.post("/Login", authController.loginAdmin);

module.exports = router;
