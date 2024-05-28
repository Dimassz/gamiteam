const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const app = express();
const mysql = require('mysql');
const AWS = require('aws-sdk');
const port = process.env.PORT || 3000;
const path = require('path');
const multer  = require('multer')


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
app.get('/home', (req, res) => {
  const userId = req.session.userId;
  if (res.locals.isLoggedIn) {
    con.query("SELECT * FROM player WHERE id=?", [userId], (err, result) => {
      if (err) {
        console.error(err);
        return res.redirect('/login');
      }
      const { name, position, level, coin, ruby, ranked } = result[0];
      con.query(`SELECT *, DATE_FORMAT(date_task, '%d/%m/%Y') as date FROM task WHERE (assignTO = ? AND task_code = 33) OR (assignTo = ? AND task_code = 22) ORDER BY id DESC LIMIT 2`, [userId, userId], (err, results_task) => {
        if (err) {
          console.error(err);
          return res.redirect('/login');
        }
        con.query(`SELECT * FROM player ORDER BY coin DESC LIMIT 3`, (err, results_leaderboard) => {
          if (err) {
            console.error(err);
            return res.redirect('/login');
          }
          res.render('home.ejs', { name, position, level, coin, ruby, ranked, results_task, leaderboard: results_leaderboard });
        });
      });
    });
  } else {
    res.redirect('/login');
  }
});

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
  con.query('SELECT * FROM player WHERE email=?', [email], (err, result) => {
    if (err || result.length === 0) {
      console.error(err);
      return res.redirect('/login');
    }
    req.session.userId = result[0].id;
    req.session.name = result[0].name;
    req.session.position = result[0].position;
    req.session.level = result[0].level;
    req.session.coin = result[0].coin;
    req.session.ruby = result[0].ruby;
    req.session.ranked = result[0].ranked;
    req.session.role = result[0].role;
    res.locals.isLoggedIn = true;
    res.redirect('/home');
  });
});

app.get('/register', (req, res) => {
  res.render('register.ejs');
});

app.post('/register', (req, res) => {
  const { name, email, password, divisi, position } = req.body;
  const level = 0;
  con.query('INSERT INTO player (name, email, password, divisi, position, level) VALUES (?, ?, ?, ?, ?, ?)', [name, email, password, divisi, position, level], (err, result) => {
    if (err) {
      console.error(err);
      return res.redirect('/register');
    }
    res.redirect('/login');
  });
});

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
  if (req.body.status === "IN PROGRESS") {
    con.query(`UPDATE task SET status = ? WHERE id = ?`, [req.body.status, taskId], (err, results) => {
      if (err) {
        console.error(err);
        return res.redirect('/taskList');
      }
      res.redirect('/taskList');
    });
  } else if (req.body.status === "COMPLETE") {
    con.query(`UPDATE task SET file = ?, status = ? WHERE id = ?`, [req.file.originalname, req.body.status, taskId], (err, results) => {
      if (err) {
        console.error(err);
        return res.redirect('/taskList');
      }
      con.query(`SELECT reward, reward_type FROM task WHERE id = ?`, [taskId], (err, results) => {
        if (err) {
          console.error(err);
          return res.redirect('/taskList');
        }
        const reward = results[0].reward;
        con.query(`UPDATE player SET coin = coin + ? WHERE id = ?`, [reward, res.locals.userId], (err, results) => {
          if (err) {
            console.error(err);
            return res.redirect('/taskList');
          }
          res.redirect('/taskList');
        });
      });
    });
  }
});

app.get('/files', (req, res) => {
  const exampleResults = {};
  res.render('files', { results: exampleResults });
});

app.post('/addTask', (req, res) => {
  const { task, taskCode, date, time, reward, punishment, repetition, reward_type, player } = req.body;
  const pic = res.locals.name;
  const task_id = Math.floor(Math.random() * 1000) + 10;
  const assignor = res.locals.userId;
  const status = "ASSIGNED";
  con.query(`SELECT * FROM player WHERE id != ?`, [assignor], (err, results) => {
    if (err) {
      console.error(err);
      return res.redirect('/taskList');
    }
    if (taskCode == 33) {
      const ids = results.map(row => row.id);
      ids.forEach(id => {
        con.query(`INSERT INTO task (task_code, task, pic, date_task, date_time, task_id, repetition, reward, punishment, reward_type, assignTo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [taskCode, task, pic, date, time, task_id, repetition, reward, punishment, reward_type, id, status], (err, results) => {
            if (err) {
              console.error(err);
            }
          });
      });
      res.redirect('/taskList');
    } else if (taskCode == 22) {
      con.query(`INSERT INTO task (task_code, task, pic, date_task, date_time, task_id, repetition, reward, punishment, reward_type, assignTo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [taskCode, task, pic, date, time, task_id, repetition, reward, punishment, reward_type, player, status], (err, results) => {
          if (err) {
            console.error(err);
            return res.redirect('/taskList');
          }
          res.redirect('/taskList');
        });
    }
  });
});

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

app.post('/upload', upload, (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const params = {
    Bucket: process.env.FILEBASE_BUCKET_NAME,
    Key: req.file.originalname,
    Body: req.file.buffer
  };

  s3.upload(params, (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error uploading file");
    }
    res.send(`File uploaded successfully. ${data.Location}`);
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
