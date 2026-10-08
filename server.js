const express=require('express');
const path=require('path');
const fs=require('fs');
const Database=require('better-sqlite3');
const multer=require('multer');

const app=express();
const PORT=process.env.PORT||3000;
const DATA=path.join(__dirname,'data');
const UP=path.join(DATA,'photos');
fs.mkdirSync(UP,{recursive:true});

const db=new Database(path.join(DATA,'school.db'));
db.pragma('journal_mode=WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS students(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 father TEXT,
 mother TEXT,
 dob TEXT,
 class TEXT NOT NULL,
 section TEXT,
 roll TEXT,
 phone TEXT,
 address TEXT,
 photo TEXT,
 session TEXT DEFAULT '2026-27',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS marks(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id INTEGER UNIQUE NOT NULL,
 hindi INTEGER DEFAULT 0,
 english INTEGER DEFAULT 0,
 mathematics INTEGER DEFAULT 0,
 science INTEGER DEFAULT 0,
 social_science INTEGER DEFAULT 0,
 FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings(
 id INTEGER PRIMARY KEY CHECK(id=1),
 school_name TEXT DEFAULT 'My School',
 session TEXT DEFAULT '2026-27',
 principal TEXT DEFAULT 'Principal'
);
INSERT OR IGNORE INTO settings(id) VALUES(1);
`);

app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use('/photos',express.static(UP));
app.use(express.static(path.join(__dirname,'public')));

const upload=multer({
 storage:multer.diskStorage({
  destination:(req,file,cb)=>cb(null,UP),
  filename:(req,file,cb)=>{
   const ext=path.extname(file.originalname).toLowerCase()||'.jpg';
   cb(null,Date.now()+'-'+Math.random().toString(36).slice(2)+ext);
  }
 }),
 limits:{fileSize:3*1024*1024},
 fileFilter:(req,file,cb)=>cb(null,/^image\//.test(file.mimetype))
});

app.get('/api/settings',(req,res)=>res.json(db.prepare('SELECT * FROM settings WHERE id=1').get()));
app.put('/api/settings',(req,res)=>{
 const {school_name,session,principal}=req.body;
 db.prepare('UPDATE settings SET school_name=?,session=?,principal=? WHERE id=1').run(school_name||'My School',session||'2026-27',principal||'Principal');
 res.json({ok:true});
});

app.get('/api/students',(req,res)=>{
 const {class:cls,section,q}=req.query;
 let sql='SELECT * FROM students WHERE 1=1', p=[];
 if(cls){sql+=' AND class=?';p.push(cls)}
 if(section){sql+=' AND section=?';p.push(section)}
 if(q){sql+=' AND (name LIKE ? OR father LIKE ? OR roll LIKE ?)';const x='%'+q+'%';p.push(x,x,x)}
 sql+=' ORDER BY CAST(class AS INTEGER), section, CAST(roll AS INTEGER), name';
 res.json(db.prepare(sql).all(...p));
});

app.get('/api/students/:id',(req,res)=>{
 const s=db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
 if(!s)return res.status(404).json({error:'Student not found'});
 const m=db.prepare('SELECT * FROM marks WHERE student_id=?').get(req.params.id)||{};
 res.json({...s,marks:m});
});

app.post('/api/students',upload.single('photo'),(req,res)=>{
 try{
  const b=req.body;
  if(!b.name||!b.class)return res.status(400).json({error:'Name and class are required'});
  const photo=req.file?'/photos/'+req.file.filename:null;
  const info=db.prepare(`INSERT INTO students(name,father,mother,dob,class,section,roll,phone,address,photo,session)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(b.name,b.father||'',b.mother||'',b.dob||'',b.class,b.section||'A',b.roll||'',b.phone||'',b.address||'',photo,b.session||'2026-27');
  res.json({ok:true,id:info.lastInsertRowid});
 }catch(e){res.status(500).json({error:e.message})}
});

app.put('/api/students/:id',upload.single('photo'),(req,res)=>{
 try{
  const old=db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if(!old)return res.status(404).json({error:'Student not found'});
  const b=req.body, photo=req.file?'/photos/'+req.file.filename:old.photo;
  db.prepare(`UPDATE students SET name=?,father=?,mother=?,dob=?,class=?,section=?,roll=?,phone=?,address=?,photo=?,session=? WHERE id=?`)
   .run(b.name,b.father||'',b.mother||'',b.dob||'',b.class,b.section||'A',b.roll||'',b.phone||'',b.address||'',photo,b.session||old.session,req.params.id);
  res.json({ok:true});
 }catch(e){res.status(500).json({error:e.message})}
});

app.delete('/api/students/:id',(req,res)=>{
 db.prepare('DELETE FROM students WHERE id=?').run(req.params.id);
 db.prepare('DELETE FROM marks WHERE student_id=?').run(req.params.id);
 res.json({ok:true});
});

app.put('/api/students/:id/marks',(req,res)=>{
 const b=req.body;
 db.prepare(`INSERT INTO marks(student_id,hindi,english,mathematics,science,social_science)
 VALUES(?,?,?,?,?,?)
 ON CONFLICT(student_id) DO UPDATE SET hindi=excluded.hindi,english=excluded.english,mathematics=excluded.mathematics,science=excluded.science,social_science=excluded.social_science`)
 .run(req.params.id,+b.hindi||0,+b.english||0,+b.mathematics||0,+b.science||0,+b.social_science||0);
 res.json({ok:true});
});

app.get('/api/dashboard',(req,res)=>{
 const total=db.prepare('SELECT COUNT(*) c FROM students').get().c;
 const classes=db.prepare('SELECT COUNT(DISTINCT class) c FROM students').get().c;
 res.json({totalStudents:total,totalClasses:classes});
});

app.listen(PORT,()=>console.log(`School ERP running on http://localhost:${PORT}`));
