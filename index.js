const express = require('express');
const Database = require("@replit/database")
const redis =  require('redis');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const {Server} = require('socket.io')
const app = express();
const http = require('http').Server(app);
const io = new Server(http, { cors: { origin: '*' } });
const crypto = require('crypto');
const { randomInt, randomBytes } = require("crypto");
var cors = require('cors')
app.use(cors())
const client = redis.createClient({
    password: process.env.REDIS_PASSWORD,
    legacyMode: true,
    socket: {
        host: 'redis-11609.c233.eu-west-1-1.ec2.cloud.redislabs.com',
        port: 11609
    }
});

const miningDifficulty = 999999

const db = new Database()

let sockets = new Map()
let miningAccounts = []

function onlyLettersAndNumbers(str) {
  return /^[A-Za-z0-9]*$/.test(str);
}

function parseNum(num){
  return Math.floor(num*1000)/1000
}

function makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}



app.get('/redeem', (req,res) => {
  if (!(req.query.hasOwnProperty("username"))){
    return res.status(200).json({"error":"You are not logged in"})
  }

  if (!(req.query.hasOwnProperty("password"))){
    return res.status(200).json({"error":"You are not logged in"})
  }

  if (!(req.query.hasOwnProperty("code"))){
    return res.status(200).json({"error":"You must enter a code to redeem"})
  }

  var username = req.query.username
  var password = req.query.password
  
  client.get(`code.${req.query.code}`, function(err, data) {
    if(data==null){
      return res.status(200).json({"error":"Code does not exist. Has someone used it already?"})
    }else{
      client.get(`account.${username}`, function(err2, data2) {
        if(data2==null){
          return res.status(200).json({"error":"Your account does not exist?"})
        }

        var acc = JSON.parse(data2)
        bcrypt.compare(password, acc.password, function(err, result) {
          if(result==true){
            var amt = parseFloat(data)
            acc.balance=parseFloat(acc.balance)+amt
    
            client.del(`code.${req.query.code}`, function(err4, data4){
              if(err4!=null){
                return res.status(200).json({"error":"Internal error occured"})
              }
              client.set(`account.${username}`, JSON.stringify(acc), function(err3, data3){
                
                return res.status(200).json({"success":"Code redeemed"})
              })
            })
          }else{
            return res.status(200).json({"error":"bad auth"})
          }
        })


      })
    }
  })
})

app.get('/transfer', (req, res) => {
  return res.status(200).json({"error":"Transactions are currently disabled"})
  if (!(req.query.hasOwnProperty("username"))){
    return res.status(200).json({"error":"You are not logged in"})
  }

  if (!(req.query.hasOwnProperty("password"))){
    return res.status(200).json({"error":"You are not logged in"})
  }

  if (!(req.query.hasOwnProperty("amount"))){
    return res.status(200).json({"error":"Please enter an amount to transfer"})
  }

  if (!(req.query.hasOwnProperty("sendto"))){
    return res.status(200).json({"error":"Please enter a username to send to"})
  }

  if (!(req.query.amount>0)){
    return res.status(200).json({"error":"You cannot send less than 0"})
  }

  if (req.query.sendto==req.query.username){
    return res.status(200).json({"error":"You cannot send money to yourself"})
  }

  var username = req.query.username
  var password = req.query.password
  var sendAmt = parseNum(req.query.amount)
  if (!(sendAmt>0)){
    return res.status(200).json({"error":"You cannot send less than 0.001"})
  }

  client.get(`account.${username}`, function(err, senderdata) {
    if(err!=null){
      console.log(err)
      return res.status(200).json({"error":"Internal error occured"})
    }
    if(senderdata==null){
      return res.status(200).json({"error":"Your account does not exist?"})
    }else{
      var senderaccount = JSON.parse(senderdata)
      bcrypt.compare(password, senderaccount.password, function(err0, result) {
        if(err0!=null){
          console.log(err0)
          return res.status(200).json({"error":"Internal error occured"})
        }
        if(result==true){
          var newAmt = parseNum(senderaccount.balance)-sendAmt
      
          if(!(newAmt>0)){
            return res.status(200).json({"error":"You cannot afford to send that much"})
          }
      
          client.get(`account.${req.query.sendto}`, function(err2, data2) {
            if(err2!=null){
              console.log(err2)
              return res.status(200).json({"error":"Internal error occured"})
            }
            if(data2!=null){
              var sendToAcc = JSON.parse(data2)
              sendToAcc.balance=parseNum(sendToAcc.balance)+sendAmt
              if(!(sendToAcc.hasOwnProperty("transactions"))){
                sendToAcc["transactions"] = []
              }
              if(!(acc.hasOwnProperty("transactions"))){
                acc["transactions"] = []
              }

              sendToAcc["transactions"].push({"from":username, "to":req.query.sendto, "date": Date.now(), "amount":sendAmt})
              acc["transactions"].push({"from":username, "to":req.query.sendto, "date": Date.now(), "amount":sendAmt})
              
              acc.balance = newAmt

              client.set(`account.${req.query.sendto}`, JSON.stringify(sendToAcc), function(err3, data3){
                if(err3!=null){
                  console.log(err3)
                  return res.status(200).json({"error":"Internal error occured"})
                }else{
                  client.set(`account.${username}`, JSON.stringify(acc), function(err4, data4){
                    if(err4!=null){
                      console.log(err4)
                      return res.status(200).json({"error":"Internal error occured"})
                    }else{
                      return res.status(200).json({"success":"transfer complete"})
                    }
                  })
                }

              })
            }else{
              return res.status(200).json({"error":"An account with that username does not exist"})
            }
          })
        }else{
          return res.status(200).json({"error":"bad auth"})
        }
      
      })
      

    }
  })
  
})

app.get('/makeaccount', (req, res) => {
  
  if (!(req.query.hasOwnProperty("username"))){
    return res.status(200).json({"error":"Please enter a username"})
  }

  if (!(req.query.hasOwnProperty("password"))){
    return res.status(200).json({"error":"Please enter a password"})
  }

  var username = req.query.username
  var password = req.query.password
  
  if (!(onlyLettersAndNumbers(username))){
    return res.status(200).json({"error":"Username must only contain letters and numbers"})
  }

  if (username.length>12 || username.length<3){
    return res.status(200).json({"error":"Username must be between 3 and 12 characters inclusive"})
  }
  
  client.get(`account.${username}`, function(err, data) {
    if(data!=null){
      return res.status(200).json({"error":"An account with that username already exists"})
    }else{
      bcrypt.hash(password, saltRounds, function(hasherr, hash) {
        acc = {
          username:username,
          password:hash,
          transactions: [],
          balance:0
        }
        client.set(`account.${username}`, JSON.stringify(acc), function(err2, data2){
        
            return res.status(200).json({"success":req.query.username})
        
        })
      }) 

      

    }
  })

})

app.get('/health', (req, res) => {
    return res.status(200).json({"working":1})
})

app.get('/userinfo', (req, res) => {
    
  if (!(req.query.hasOwnProperty("username"))){
    return res.status(200).json({"error":"Please enter a username"})
  }

  if (!(req.query.hasOwnProperty("password"))){
    return res.status(200).json({"error":"Please enter a password"})
  }

  var username = req.query.username
  var password = req.query.password
  
  client.get(`account.${username}`, function(err, data){
    if(data==null){
      return res.status(200).json({"error":"Account doesn't exist. Try re-creating a new account."}) 
    }else{
      var acc = JSON.parse(data)
      bcrypt.compare(password, acc.password, function(err2, result) {
        if(result==true){
          if(!(acc.hasOwnProperty("transactions"))){
            acc["transactions"] = []
          }
          if(acc.username!=username){
            return res.status(200).json({"error":"Serious error occured ..."})
          }else{
            return res.status(200).json({"success":"account exists","account":acc})
          }
            
          
        }else{
          return res.status(200).json({"error":"bad auth"})
        }
      });
    }
  })
  
})

app.get('/', (req, res) => {
  res.sendFile(__dirname+"/index.html");
});

app.get('/signup', (req, res) => {
  res.sendFile(__dirname+"/signup.html");
});
app.get('/login', (req, res) => {
  res.sendFile(__dirname+"/login.html");
});

(function payout() {
    var payoutAmount = parseNum(0.05/sockets.size)
    sockets.forEach((data, socket) => {
      if(data.username!=null){
        client.get(`account.${data.username}`, function(err2, data2) {
          if(err2!=null){
            console.log(err2)
            socket.emit("statusbad", "Error occured whilst mining. Log out and try to log back in.")
            socket.disconnect()
          }else{
              var acc = JSON.parse(data2)
              var amt = payoutAmount
              acc.balance=parseNum(parseNum(acc.balance)+amt)
              client.set(`account.${data.username}`, JSON.stringify(acc), function(err3, data3){
                if(err3!=null){
                  socket.emit("statusbad", "Error occured whilst mining. Log out and try to log back in.")
                }else{
                  socket.emit("gained", amt)
                  socket.emit("miners", sockets.size)
                }

              })
          }
        })
      }
    })
    setTimeout( payout, 10000 );
})();

io.on("connection", (socket) => {
  socket.on("username", (username) => {
      if(miningAccounts.includes(username)){
        socket.emit("statusbad", "You cannot mine on more than one device")
      }else{
        socket.emit("statusgood", "Started mining")
        miningAccounts.push(username)
        sockets.set(socket, {timeOnline:0, username: username})
      }
    
  })
  socket.on("stopmining", () => {
    if(sockets.has(socket)){
      miningAccounts.splice(miningAccounts.indexOf(sockets.get(socket).username), 1)
      sockets.delete(socket)
      socket.emit("statusbad", "Stopped mining")
    }
  })
  socket.on('disconnect', () => {
    if(sockets.has(socket)){
      miningAccounts.splice(miningAccounts.indexOf(sockets.get(socket).username), 1)
    }
    sockets.delete(socket)
    console.log("disconnection")
  })
})



http.listen(10000, () => {
  console.log('server started');
});

client.connect()
    .then(() => {
      console.log("Redis connected")
    })
