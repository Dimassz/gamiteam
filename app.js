const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const app = express();
const mysql = require('mysql');
const port = process.env.PORT || 3000;
const path = require('path');

const multer  = require('multer')
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null,file.originalname)
  }
})
const upload = multer({ storage: storage })


app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path, stat) => {
      res.set('Content-Disposition', 'inline');
  }
}));
app.use(express.static(__dirname + "/public/"));
app.use(express.urlencoded({extended: false}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(
    session({
      secret: 'my_secret_key',
      resave: false,
      saveUninitialized: false,
    })
  );

var con = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "password",
    database: "gamiteam"
  });

con.getConnection(function(err) {
    if (err) throw err;
    console.log("Connected to databases!");
  });

const sessionStore = new MySQLStore({}, con);

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
  });

app.use((req, res,  next)=>{


    if(req.session.userId === undefined){
      console.log("Belum Login")
      res.locals.name="Tamu"
      req.session.user_number=0
      res.locals.isLoggedIn = false;
      

    }
    else{
      res.locals.name=req.session.name
      res.locals.userId=req.session.userId
      res.locals.position=req.session.position
      res.locals.level=req.session.level
      res.locals.coin=req.session.coin
      res.locals.ruby=req.session.ruby
      res.locals.ranked=req.session.rangked
      res.locals.role=req.session.role
      res.locals.isLoggedIn = true;
      console.log("USER ID:" +res.locals.userId )
    }
    next();

  })

app.get('/home', (req, res)=>{
    const userId=req.session.userId
    
    if(res.locals.isLoggedIn){
      con.query("SELECT * FROM player where id=?",[userId],(err, result)=>{
        const name=result[0].name
        const position=result[0].position
        const level=result[0].level
        const coin= result[0].coin
        const ruby=result[0].ruby
        const ranked=result[0].ranked
        const id = res.locals.userId
        con.query(`SELECT *, DATE_FORMAT(date_task, '%d/%m/%Y') as date FROM task where (assignTO = ${id} and task_code = 33) or (assignTo=${id} and task_code = 22) ORDER BY id DESC LIMIT 2`,(err, results_task)=>{
          con.query(`SELECT * FROM player ORDER BY coin DESC limit 3`,(err, results_leaderboard)=>{
            res.render('home.ejs', {name:name, position:position, level:level, coin:coin, ruby:ruby,ranked:ranked, results_task:results_task, leaderboard:results_leaderboard})
          })
        })
      })
    }else(
      res.redirect("login")
    )
})

app.get('/login',(req,res)=>{
  res.render('login.ejs')
})

app.get('/profile',(req,res)=>{
  const id=res.locals.userId
  con.query(`SELECT * FROM player where id=?`,[id],(err, results)=>{
    console.log(err)
    console.log(results)
    const data = results[0]
    res.render('profile.ejs',{data:data})
  })
})

app.post('/login',(req,res)=>{
  const email=req.body.email
  const password=req.body.password
  con.query('SELECT * FROM player where email=?',[email],(err,result)=>{
    req.session.userId=result[0].id
    req.session.name=result[0].name
    req.session.position=result[0].position
    req.session.level=result[0].level
    req.session.coin=result[0].coin
    req.session.ruby=result[0].ruby
    req.session.ranked=result[0].ranked
    req.session.role=result[0].role
    console.log(result.insertId)
    res.locals.isLoggedIn = true;
    console.log(result.insertId)
    res.redirect('/home')
      
  })
})

app.get('/register', (req, res)=>{
  res.render('register.ejs')
})

app.post('/register',(req,res)=>{
  const name=req.body.name
  const email=req.body.email
  const password=req.body.password
  const divisi=req.body.divisi
  const position=req.body.position
  const level = 0

  con.query('INSERT INTO player(name, email, password, divisi, position,level) VALUES (?,?,?,?,?,?)',[name,email,password,divisi,position,level],(err,result)=>{
    console.log(result)
    console.log(err)
    res.render('home.ejs')
  })
})

app.get('/data', (req, res)=>{
    con.query("SELECT * FROM player",(err, result)=>{
      res.send(result)
    })
})

app.get('/taskList',(req, res)=>{
  
  const role=res.locals.role
  const id = res.locals.userId
  con.query(`SELECT *, DATE_FORMAT(date_task, '%d/%m/%Y') as date FROM task where (assignTO = ${id} and task_code = 33) or (assignTo=${id} and task_code = 22) ORDER BY id DESC`,(err,results_task)=>{
    if (err) {
      console.error(err);
      return res.redirect('/login');
    }
    console.log(results_task)
    con.query('SELECT id, name FROM player',(err, results_player)=>{
      res.render('taskList.ejs', {results_task:results_task, role:role, results_player:results_player})
    })
  })
 })

app.get('/task/:taskId', (req, res)=>{
  const taskId = req.params.taskId;
  console.log(res.locals.isLoggedIn)
  if(res.locals.isLoggedIn){
    con.query(`SELECT *, DATE_FORMAT(date_task, '%d/%m/%Y') as date FROM task where id=${taskId}`,(err, results)=>{
      res.render('task.ejs', {results:results[0]})
  })
  }else{
    res.redirect('/login')  
  }
})

app.post('/task/:taskId',upload.single('file'),(req, res)=>{
  const taskId=req.params.taskId
  if(req.body.status === "IN PROGRESS"){
    con.query(`UPDATE task SET status = "${req.body.status}" where id =${taskId}`,(err, results)=>{
    console.log(results);
    console.log(err)
    res.redirect('/taskList')
  })
  }else if(req.body.status === "COMPLETE"){
    con.query(`UPDATE task SET file="${req.file.originalname}", status = "${req.body.status}" where id =${taskId}`,(err, results)=>{
    con.query(`SELECT reward,reward_type from task where id=${taskId}`,(err,results)=>{
      const reward = results[0].reward
      con.query(`UPDATE player set coin = coin + ${reward} where id = ${res.locals.userId}`,(err, results)=>{
        console.log(err)
        console.log(results)
        res.redirect('/taskList')
      })
    })
  })
  }
  
})

app.get('/files', (req, res) => {
    const exampleResults = {
    };
    res.render('files', { results: exampleResults });
});


app.post('/addTask', (req, res)=>{
  const task= req.body.task
  const taskCode=req.body.taskCode
  const date=req.body.date
  const time=req.body.time
  const reward=req.body.reward
  const punishment=req.body.punishment
  const pic=res.locals.name
  const task_id= Math.floor(Math.random() * 1000) + 10
  const repetition=req.body.repetition
  const assignor=res.locals.userId
  const status= "ASSIGNED"
  const reward_type=req.body.reward_type
  const player=req.body.player
  console.log(assignor)

  con.query(`SELECT * FROM player where id != ${assignor} `,(err, results)=>{

    if(taskCode == 33){
    const ids = results.map(row => row.id);
    ids.forEach(id=>{
      con.query(`INSERT INTO task (task_code, task,pic, date_task, date_time, task_id, repetition,reward, punishment, reward_type, assignTo, status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,[taskCode, task,pic, date,time, task_id, repetition, reward, punishment, reward_type, id,status ],(err, results)=>{
    }) })
    console.log(err)
    console.log(results)
    res.redirect('/taskList')
    }else if (taskCode == 22){
      con.query(`INSERT INTO task (task_code, task,pic, date_task, date_time, task_id, repetition,reward, punishment, reward_type, assignTo, status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,[taskCode, task,pic, date,time, task_id, repetition, reward, punishment, reward_type, player,status ],(err, results)=>{
        res.redirect('/taskList')
      })
    }
  })
})

app.get('/leaderboard', (req, res)=>{
  con.query(`SELECT * FROM player ORDER BY coin DESC`,(err,results)=>{
  res.render('leaderboard.ejs',{results:results})
  })
})

app.get('/logout', (req, res) => {
  req.session.destroy((error) => {
    res.redirect('/login');
  });
});

//------------///

app.get('/test', (req, res)=>{
  res.render('test.ejs')
})
app.post('/api/upload',upload.single('file'), (req, res)=>{
  res.json(req.file.originalname)
}
)



app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  }); 
