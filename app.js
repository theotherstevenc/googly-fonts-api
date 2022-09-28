const express = require('express')
const fetch = require('node-fetch')
require('dotenv').config()
const app = express()
const PORT = process.env.PORT || 3000;

const cors = require('cors')
app.use(cors())

app.get('/', (req,res)=>{

  const limit = req.query.limit || 5
  const sortby = req.query.sort || 'popularity'

  fetch(`${process.env.API_BASE_URL}?key=${process.env.API_KEY}&sort=${sortby}`)
    .then(res => res.json())
    .then(data => {
      res.send(JSON.stringify(
        data.items.map(el => el.family)
        .slice(0,limit)
      ))
    });
  
})

app.listen(PORT, () => {
    console.log(`App is running on port ${ PORT }`);
});