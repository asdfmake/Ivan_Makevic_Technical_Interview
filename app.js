const express = require('express');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');
const generateId = require('uuid');

const app = express();
const port = 3000;

app.use(express.json());
const secretKey = "CitrusSecret";

const db = new sqlite3.Database('./Technical.db', (err) => {
    if (err) {
      console.error(err.message);
    } else {
      console.log('Connected to SQLite database');
    }
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username CHAR(32) NOT NULL,
    password CHAR(32) NOT NULL,
    balance INTEGER NOT NULL,
    games TEXT NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS transactions (
    deposit_id CHAR(32) PRIMARY KEY,
    user_id INTEGER,
    amount REAL,
    FOREIGN KEY (user_id) REFERENCES users(id)
)`);
db.run(`CREATE TABLE IF NOT EXISTS games (
    game_id CHAR(32) PRIMARY KEY,
    name CHAR(32) NOT NULL,
    title CHAR(32) NOT NULL,
    price INTEGER NOT NULL
)`);

function verifyToken(req, res, next) {
    const token = req.headers['x-token']; // Assuming the token is sent in the Authorization header
    if (token) {
      jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
          return res.status(401).json({ error: 'Token is not valid' });
        }
        req.decoded = decoded;
        next();
      });
    } else {
      res.status(401).json({ error: 'Token is required' });
    }
}

app.get('/users', (req, res) => {
    db.all('SELECT * FROM users', (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ users: rows });
    });
});

app.get("/getTransations", (req, res)=>{
    db.all('SELECT * FROM transactions', (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ transtion: rows });
      });
})

app.get("/getGames", (req, res)=>{
    db.all('SELECT * FROM games', (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ transtion: rows });
      });
})



app.post("/registration", (req, res)=>{
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: "Not succeed. Unknow error" });
        return;
      }
  
      if (row) {
        res.status(403).json({ message: 'Username already exists' });
        return;
      }
  
      db.run('INSERT INTO users (username, password, balance, games) VALUES (?, ?, 0, "[]")', [username, password], function(insertErr) {
        if (insertErr) {
            //could give more specific error but test requires specific errors and messages
            res.status(500).json({ message: "Not succeed. Unknow error" });//this error could be "Not succeed, no username was submitted"
            return;
        }
  
        res.status(201).json({ message: 'User created successfully' });
      });
    });
})

app.post("/token", (req, res)=>{
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
        if (err) {
            res.status(500).json({ error: "Not succeed. Unknow error" });
            return;
        }
        if(row){
            const token = jwt.sign({ id: row.id }, secretKey, { expiresIn: '1h' });
            res.status(200).json({ token: token, balance: row.balance, games: JSON.parse(row.games), message: "Successfully requested unique user token and other data!"});
            return;
        }
        else{
            res.status(401).json({description: "Not succeed. Invalid username or password"})
            return;
        }
    });
})

/* The following methods should only work when passing the token received from method /token in the X-Token header. */

app.post("/deposit", verifyToken, (req, res)=>{
    const { username, amount } = req.body;
    
    if(amount < 0){
        res.status(400).json({ message: "deposit amount must be positive!" });
        return;
    }//extras

    db.run('UPDATE users SET balance = balance + ? WHERE username = ?', [amount, username], function(err) {
        if (err) {
            res.status(500).json({ message: "Not succeed. Unknow error" })//could provide more data about the error if needed
            return;
        }
        
        if (this.changes > 0) {
            //handle deposit id
            deposit_id = generateId.v4();
            db.run('INSERT INTO transactions (user_id, deposit_id, amount) VALUES (?, ?, ?)', [req.decoded.id, deposit_id, amount], function(err) {
                if (err) {
                    res.status(500).json({description: "failed to add transation to db"})
                    console.error(err.message);
                    return;
                }          
            });
              
          res.status(200).json({description: "Successful", deposit_id: deposit_id})
          return;
        } else {
          res.status(200).json({message: "error", description: "Not succeed. Invalid username or password"})
          return;
        }
      });

})

app.post("/rollback", verifyToken,  (req, res)=>{
    const { deposit_id } = req.body;

    if(!deposit_id){
        res.status(400).json({ message: "request must contain deposit id!" });
        return;
    }

    db.run(`UPDATE users 
    SET balance = (
      SELECT users.balance - transactions.amount 
      FROM transactions 
      WHERE transactions.user_id = users.id AND transactions.deposit_id = ?
    )`, [deposit_id], function (err) {
        if (err){
            if(err.errno == 19){
                res.status(400).json({ description: "Not succeed. Unknow deposit id" })
                return;
            }
            else{
                res.status(500).json({ description: "Not succeed. Unknow error" })
                return;
            }
            
        }
        
        db.all(`SELECT balance FROM transactions INNER JOIN users 
        ON transactions.user_id = users.id WHERE transactions.deposit_id = ?`, [deposit_id], function(err, rows){
            if(err){
                console.log(err)
                res.status(500).json({ message: err })
                return;
            }
            res.status(200).json({ balance: rows[0].balance})
            return;
        })

    });

})

app.post("/game/create", verifyToken, (req, res)=>{
    const { name, title, price } = req.body;

    if(name == null || title == null || price == null){
        res.status(400).json({ message: "name, title, and price fields must not be undefined!" })
        return;
    }

    const game_id = generateId.v4()
    db.run(`INSERT INTO games(game_id, name, title, price) VALUES (?, ?, ?, ?)`, [game_id, name, title, price], function(err){
        if(err){
            console.log(err)
            res.status(500).json({ message: "Not succeed. Unknow error" });
            return;
        }

        res.status(200).json({ game_id: game_id, message: "success" })
        return;
    })
})

app.post("/game/buy", verifyToken, async (req, res)=>{
    const { game_id, username } = req.body;
    var invalidParameters = false;

    //check if game_id is valid
    db.get("SELECT game_id FROM games WHERE game_id = ?", [game_id], (err, row)=>{
        if(err || !row){
            console.log(err)
            res.status(400).json({ message: "Not succeed. Unknow game" });
            return;
        }
    })
    //check if username is valid
    db.get("SELECT username FROM users WHERE username = ?", [username], (err, row)=>{
        if(err || !row){
            console.log(err)
            res.status(400).json({ message: "Not succeed. Invalid username" });
            return;
        }
    })
    
    db.get("SELECT price, balance, games FROM games, users WHERE game_id = ? AND username = ?", [game_id, username], function (err, row){
        if(err){
            console.log(err)
            res.status(500).json({ message: 'Not succeed. Invalid token or username' });
            return;
        }

        if(!row){
            console.log("there was an error in username or game_id parameters!");
            return;
        }
    
        let { price, balance, games } = row;

        if(price > balance){
            res.status(422).json({ message: 'Not succeed. Not funds' })
            return
        }

        games = JSON.parse(games)
        if(!games.includes(game_id)){
            games.push(game_id)
        }
        db.run("UPDATE users SET balance = balance - ?, games = ? WHERE username = ?", [price, JSON.stringify(games), username], (err)=>{
            if(err){
                res.status(500).json({ message: "error while updating balance for user" })
                return
            }

            res.status(200).json({game_id: game_id, balance: balance - price, message: "success"})
            return;
        })
        
    })
})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
  