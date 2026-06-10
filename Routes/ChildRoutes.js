const express = require("express");
const router = express.Router();
const childController = require("../Controller/ChildController");

router.get("/api/tags/available", childController.getAvailableTags);
router.get("/api/children", childController.getChildren);
router.get("/api/children/:id/sessions", childController.getChildSessions);
router.post("/api/children", childController.addChild);
router.put("/api/children/:id", childController.updateChild);
router.delete("/api/children/:id", childController.deleteChild);

module.exports = router;
