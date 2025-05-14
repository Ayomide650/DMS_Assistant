const express = require('express');
const config = require('./config');

const app = express();

app.get('/', (req, res) => {
  res.send('Discord bot is running!');
});

function keepAlive() {
  app.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
  });
}

module.exports = { keepAlive };
