const express = require('express');
const SocketIO = require('socket.io');

// Express config
const app = express();
app.set('view engine', 'ejs')
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.render('index')
})
server = app.listen(5000);

// Socket.io config
const io = SocketIO(server, {
  // all this is required for cross-origin issues
  handlePreflightRequest: (req, res) => {
    const headers = {
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Origin": req.headers.origin, //or the specific origin you want to give access to,
      "Access-Control-Allow-Credentials": true
    };
    res.writeHead(200, headers);
    res.end();
  }
});

module.exports = { io };
