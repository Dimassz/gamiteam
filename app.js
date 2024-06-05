const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const app = express();
const mysql = require('mysql');
const AWS = require('aws-sdk');
const port = process.env.PORT || 3000;
const path = require('path');
const multer  = require('multer')
const { Client } = require('pg')


const client = new Client({
  user: "default",
  host: "ep-little-feather-a1ehqcj5-pooler.ap-southeast-1.aws.neon.tech",
  database: "verceldb",
  password: "BTxaSpX23GgZ",
  port: 5432,
  ssl:{
    rejectUnauthorized: false
  }
})
client.connect(function(err) {
  if (err) throw err;
  console.log("Connected to Postgresql");
});

app.get('/pg',(req, res)=>{
  client.query('SELECT * FROM player',(err, results)=>{
  console.log(err)
  res.send(results.rows[1].name)
  })
})

const s3 = new AWS.S3({
  accessKeyId: process.env.FILEBASE_ACCESS_KEY,
  secretAccessKey: process.env.FILEBASE_SECRET_KEY,
  endpoint: process.env.FILEBASE_ENDPOINT,
  s3ForcePathStyle: true, // Needed with minio?
  signatureVersion: 'v4'
});
// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const params = {
    Bucket: 'gamiteam',
    Key: req.file.originalname,
    Body: req.file.buffer
  };

  s3.upload(params, (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error uploading file");
    }
    console.log()
    res.send(`File uploaded successfully. ${data.Location}`);
  });
});

app.get('/view/:key', (req, res) => {
  const params = {
    Bucket: 'gamiteam',
    Key: req.params.key,
  };

  s3.getObject(params, (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error getting file from Filebase');
    }
    
    // Detect the content type of the file
    const contentType = data.ContentType || 'application/octet-stream';
    console.log(data)
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename=${req.params.key}`);
    res.send(data.Body);
  });
});


// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path, stat) => {
    res.set('Content-Disposition', 'inline');
  }
}));
app.use(express.static(__dirname + "/public/"));
app.use(express.urlencoded({ extended: false }));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const dbConfig = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    connectionLimit: 10,
    connectTimeout: 10000,
    acquireTimeout: 10000,
    timeout: 10000
  };
const con = mysql.createPool(dbConfig);

con.getConnection((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log("Connected to databases!");
});

// Session store setup
const sessionStore = new MySQLStore({}, con);
app.use(session({
  key: 'session_cookie_name',
  secret: 'my_secret_key',
  store: sessionStore,
  resave: false,
  saveUninitialized: false
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  res.status(500).send('Something went wrong!');
  connection.release();

});

// Middleware to check login status
app.use((req, res, next) => {
  if (req.session.userId === undefined) {
    console.log("Belum Login");
    res.locals.name = "Tamu";
    req.session.user_number = 0;
    res.locals.isLoggedIn = false;
  } else {
    res.locals.name = req.session.name;
    res.locals.userId = req.session.userId;
    res.locals.position = req.session.position;
    res.locals.level = req.session.level;
    res.locals.coin = req.session.coin;
    res.locals.ruby = req.session.ruby;
    res.locals.ranked = req.session.ranked;
    res.locals.role = req.session.role;
    res.locals.isLoggedIn = true;
    console.log("USER ID:" + res.locals.userId);
  }
  next();
});

// Routes

app.get('/',(req, res)=>{
  if(res.locals.isLoggedIn){
    res.render('home.ejs')
  }else{
  res.redirect('/login')
}})

// app.get('/home', (req, res) => {
//   const userId = req.session.userId;
//   if (res.locals.isLoggedIn) {
//     client.query('SELECT * FROM player WHERE id=?', [userId], (err, result) => {
//       if (err) {
//         console.error(err);
//         return res.redirect('/login');
//       }
//       const { name, position, level, coin, ruby, ranked } = result.rows[0];
//       client.query(`SELECT * FROM task WHERE (assignTO = $1 AND task_code = 33) OR (assignTo = $1 AND task_code = 22) ORDER BY id DESC LIMIT 2`, [userId], (err, results_task) => {
//         if (err) {
//           console.error(err);
//           return res.redirect('/login');
//         }
//         client.query(`SELECT * FROM player ORDER BY coin DESC LIMIT 3`, (err, results_leaderboard) => {
//           if (err) {
//             console.error(err);
//             return res.redirect('/login');
//           }
//           res.render('home.ejs', { name, position, level, coin, ruby, ranked, results_task:results_task.rows, leaderboard: results_leaderboard.rows });
//         });
//       });
//     });
//   } else {
//     res.redirect('/login');
//   }
// });

app.get('/home', (req, res)=>{
    const userId=req.session.userId
    
    if(res.locals.isLoggedIn){
      client.query('SELECT * FROM player where id=$1',[userId],(err, result)=>{
        console.log(err)
        const name=result.rows[0].name
        const position=result.rows[0].position
        const level=result.rows[0].level
        const coin= result.rows[0].coin
        const ruby=result.rows[0].ruby
        const ranked=result.rows[0].ranked
        const id = res.locals.userId
        client.query(`SELECT * FROM task where (assignTO = ${id} and task_code = 33) or (assignTo=${id} and task_code = 22) ORDER BY id DESC LIMIT 2`,(err, results_task)=>{
          console.log(err)
          console.log('pass')
          client.query(`SELECT * FROM player ORDER BY coin DESC limit 3`,(err, results_leaderboard)=>{
            console.log(results_leaderboard.rows)
            res.render('home.ejs', {name:name, position:position, level:level, coin:coin, ruby:ruby,ranked:ranked, results_task:results_task.rows, leaderboard:results_leaderboard.rows})
          })
        })
      })
    }else(
      res.redirect("login")
    )
})

app.get('/login', (req, res) => {
  res.render('login.ejs');
});

app.get('/profile', (req, res) => {
  const id = res.locals.userId;
  con.query(`SELECT * FROM player WHERE id=?`, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.redirect('/login');
    }
    const data = results[0];
    res.render('profile.ejs', { data });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  client.query('SELECT * FROM player WHERE email=$1', [email], (err, result) => {
    if (err || result.rows.length === 0) {
      console.log("error login")
      console.error(err);
      return res.redirect('/login');
    }
    req.session.userId = result.rows[0].id;
    req.session.name = result.rows[0].name;
    req.session.position = result.rows[0].position;
    req.session.level = result.rows[0].level;
    req.session.coin = result.rows[0].coin;
    req.session.ruby = result.rows[0].ruby;
    req.session.ranked = result.rows[0].ranked;
    req.session.role = result.rows[0].role;
    res.locals.isLoggedIn = true;
    res.redirect('/home');
  });
});


app.get('/register', (req, res) => {
  res.render('register.ejs');
});

app.post('/register',(req,res)=>{
  const name=req.body.name
  const email=req.body.email
  const password=req.body.password
  const divisi=req.body.divisi
  const position=req.body.position
  const level = 0
  let divisi_id =0;
  const role = "Player"
  const ranked="bronze"
  const coin=0
  const ruby=0

  if(divisi === "CEO"){
    divisi_id =0;
  }else if (divisi === "Operation"){
    divisi_id =1;
  }else if(divisi === "Marketing"){
    divisi_id = 2
  }else if(divisi ==="Finance"){
    divisi_id=3
  }else if(divisi === "Human Capital + Legal"){
    divisi_id=4
  }else if(divisi === "Halalin Academy"){
    divisi_id=5
  }


  con.query('INSERT INTO player(name, email, password, divisi, position,level,divisi_id,role,ranked,coin,ruby) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[name,email,password,divisi,position,level,divisi_id,role,ranked,coin,ruby],(err,result)=>{
    console.log(result)
    console.log(err)
    res.locals.isLoggedIn = true;
    res.redirect('/home')
  })
})

app.get('/data', (req, res) => {
  con.query("SELECT * FROM player", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.send(result);
  });
});

app.get('/taskList', (req, res) => {
  const role = res.locals.role;
  const id = res.locals.userId;
  con.query(`SELECT *, DATE_FORMAT(date_task, '%d/%m/%Y') as date FROM task WHERE (assignTO = ? AND task_code = 33) OR (assignTo = ? AND task_code = 22) ORDER BY id DESC`, [id, id], (err, results_task) => {
    if (err) {
      console.error(err);
      return res.redirect('/login');
    }
    con.query('SELECT id, name FROM player', (err, results_player) => {
      if (err) {
        console.error(err);
        return res.redirect('/login');
      }
      res.render('taskList.ejs', { results_task, role, results_player });
    });
  });
});

app.get('/task/:taskId', (req, res) => {
  const taskId = req.params.taskId;
  if (res.locals.isLoggedIn) {
    con.query(`SELECT *, DATE_FORMAT(date_task, '%d/%m/%Y') as date FROM task WHERE id=?`, [taskId], (err, results) => {
      if (err) {
        console.error(err);
        return res.redirect('/login');
      }
      res.render('task.ejs', { results: results[0] });
    });
  } else {
    res.redirect('/login');
  }
});

app.post('/task/:taskId', upload.single('file'), (req, res) => {
  const taskId = req.params.taskId;
  const params = {
    Bucket: 'gamiteam',
    Key: req.file.originalname,
    Body: req.file.buffer
  }
  if (req.body.status === "IN PROGRESS") {
    con.query(`UPDATE task SET status = ? WHERE id = ?`, [req.body.status, taskId], (err, results) => {
      if (err) {
        console.error(err);
        return res.redirect('/taskList');
      }
      res.redirect('/taskList');
    })
  } else if (req.body.status === "COMPLETE") {
    s3.upload(params, (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error uploading file");
      }
      console.log(data)
      con.query(`UPDATE task SET file="${data.key}", status = "${req.body.status}" where id =${taskId}`,(err, results)=>{
      console.log(err)
      con.query(`SELECT reward,reward_type from task where id=${taskId}`,(err,results)=>{
        const reward = results[0].reward
        con.query(`UPDATE player set coin = coin + ${reward} where id = ${res.locals.userId}`,(err, results)=>{
          console.log(err)
          console.log(results)
          res.redirect('/taskList')
        })
      })
    })
    })
  }
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const params = {
    Bucket: 'gamiteam',
    Key: req.file.originalname,
    Body: req.file.buffer
  };

  s3.upload(params, (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error uploading file");
    }
    console.log()
    res.send(`File uploaded successfully. ${data.Location}`);
  });
});


app.get('/files', (req, res) => {
  const exampleResults = {};
  res.render('files', { results: exampleResults });
});

// app.post('/addTask', (req, res) => {
//   const { task, taskCode, date, time, reward, punishment, repetition, reward_type, player } = req.body;
//   const pic = res.locals.name;
//   const task_id = Math.floor(Math.random() * 1000) + 10;
//   const assignor = res.locals.userId;
//   const status = "ASSIGNED";
//   con.query(`SELECT * FROM player WHERE id != ?`, [assignor], (err, results) => {
//     if (err) {
//       console.error(err);
//       return res.redirect('/taskList');
//     }
//     if (taskCode == 33) {
//       const ids = results.map(row => row.id);
//       ids.forEach(id => {
//         con.query(`INSERT INTO task (task_code, task, pic, date_task, date_time, task_id, repetition, reward, punishment, reward_type, assignTo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//           [taskCode, task, pic, date, time, task_id, repetition, reward, punishment, reward_type, id, status], (err, results) => {
//             if (err) {
//               console.error(err);
//             }
//           });
//       });
//       res.redirect('/taskList');
//     } else if (taskCode == 22) {
//       con.query(`INSERT INTO task (task_code, task, pic, date_task, date_time, task_id, repetition, reward, punishment, reward_type, assignTo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//         [taskCode, task, pic, date, time, task_id, repetition, reward, punishment, reward_type, player, status], (err, results) => {
//           if (err) {
//             console.error(err);
//             return res.redirect('/taskList');
//           }
//           res.redirect('/taskList');
//         });
//     }
//   });
// });

app.get('/leaderboard', (req, res) => {
  con.query(`SELECT * FROM player ORDER BY coin DESC`, (err, results) => {
    if (err) {
      console.error(err);
      return res.redirect('/home');
    }
    res.render('leaderboard.ejs', { results });
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error(error);
      return res.redirect('/home');
    }
    res.redirect('/login');
  });
});

app.get('/test', (req, res) => {
  res.render('test.ejs');
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

