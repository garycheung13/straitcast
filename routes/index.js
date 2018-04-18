var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.json({
    message: "This is the web service for the podcast player"
  })
});

module.exports = router;
