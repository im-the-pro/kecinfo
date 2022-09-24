const app = require('express')();
const server = require('http').createServer(app);
const  io = require('socket.io')(server);
const fs = require('fs')

const { route : r1 } = require('./db.service/service/createVerifyLink');
const { route : r2 , routeVerifyLinks } = require('./db.service/service/routeVerifyLinks');
const addUser = require('./db.service/User/addUser');
const searchUser = require('./db.service/User/searchUser');
const { IP } = require('./config');
const { comPass } = require('./db.service/service/passwordHash');
const { User } = require('./db.service/User/config');
const { UniqueId } = require("./db.service/service/getUniqueId");
const { FileTrans } = require('./db.service/service/fileTrans');

routeVerifyLinks();
io.on('connection', async (client) => {
    console.log('connected')                                                            /*<<<--- debug consoler here -->>>*/ 
    client.on("current-stat",async (data) => {
        data = JSON.parse(data);
        
    })
    client.on('signup',async (data) => {
        data = JSON.parse(data);
        data = await addUser({ email: data.email , password: data.password })
        console.log(data);                                                              /* <<<--- debug consoler here -->>>*/
        client.emit('signupResult',data);
    })
    client.on('login',async (data) => {
        data = JSON.parse(data);
        console.log(data);
        const email = data.email.toString();
        const user = await searchUser({ email: data.email });
        if(user == null){ 
            client.emit('loginResult',{ result : 'Wrong Email ID !' });
        }
        else {
            if(user.verified){
                if(await comPass(data.password,user.password)){
                    const authToken = await UniqueId();
                    await User.findOneAndUpdate({
                       email
                    },{
                        wrongPassAttempts: 0,
                        authToken: authToken,
                    });
                    if(user.pic){   
                        var eventname = authToken+'-profilefromDb';
                        client.emit("LoginProfileShare",{eventname});
                        const filetrans = new FileTrans({eventname , socket: client });
                        filetrans.send({
                            Filepath: user.pic,
                            onSuccess: () => {
                                if(user.setup){
                                    client.emit('loginResult',{ result : 'Login SuccessFul !' , name : user.name,  authToken : authToken});
                                }
                                else
                                    client.emit('loginResult',{ result : 'Login SuccessFul !' ,setup : user.role , authToken : authToken});
                            },onErr: err => console.log(err)
                        })
                    } else {
                        if(user.setup){
                            client.emit('loginResult',{ result : 'Login SuccessFul !' , name : user.name,  authToken : authToken});
                        }
                        else
                            client.emit('loginResult',{ result : 'Login SuccessFul !' ,setup : user.role , authToken : authToken});
                    }
                }
                else {
                    if(user.wrongPassAttempts >= 3){
                        client.emit('loginResult',{ result : 'Max Attempts reached !' });
                        await User.findOneAndUpdate({
                            email
                        },{
                            verified: false
                        })
                    } else {
                        client.emit('loginResult',{ result : 'Wrong Password !' });
                        await User.findOneAndUpdate({
                            email
                        },{
                            wrongPassAttempts:user.wrongPassAttempts + 1
                        });
                    }
                }
            } else {
                client.emit('loginResult',{ result : 'Please Verify Email ID !'});
            }
        }
    })
    client.on('forgotPass',async (data) => {
        data = JSON.parse(data);
        const user = await User.findOne({email: data.email });
        if(user != null){
            await User.findOneAndUpdate({
                email: data.email
            },{
                verified: false
            });
            client.emit('forgotPassResult','Signup with new Password !');
        } else {
            client.emit('forgotPassResult','Wrong Email ID !');
        }
    })
    client.on('setup',async (data) => {
        data = JSON.parse(data);
        console.log(data);                                                     /*<<<-- debug consoler here -->>>*/
        const user = await User.findOne({authToken : data.authToken });
        if(user != null){
            if(data.as == 'Student'){
                await User.findOneAndUpdate({
                    authToken : data.authToken
                },{
                    year: data.year,
                    name: data.name != null? data.name : user.name,
                    setup : true
                })
                const eventname = data.authToken + "-setupProfile";
                console.log(data,eventname);
                if(data.image){
                    const filetrans = new FileTrans({eventname,socket:client,});
                    await filetrans.receive({
                        onSuccess: async (path) => {
                            const file = "D:/Projects/Server/db.service/Files/"+ user.email + '.' + path.split(".").pop();
                            fs.rename(path, file , function (err) {
                                if (err) throw err;
                                // console.log('File Renamed.');
                              },);
                            await User.findOneAndUpdate({
                                authToken : data.authToken
                            },{
                                pic : file,
                                setup : true
                            })
                            client.emit('setupResult',{result : 'Setup SuccessFul !'});
                        },onErr: err => console.log(err)
                    });
                    client.emit('fs-start',{eventname:eventname});
                } else {
                    client.emit('setupResult',{result : 'Setup SuccessFul !'});
                    
                }
            } else if(data.as == "Faculty"){
                await User.findOneAndUpdate({
                    authToken : data.authToken
                },{
                    post: data.post,
                    dept: data.dept.toString().toUpperCase(),
                    name: data.name != null? data.name : user.name
                })
                const eventname = data.authToken + "-setupProfile";
                console.log(data,eventname);
                if(data.image){
                    const filetrans = new FileTrans({eventname,socket:client,});
                    await filetrans.receive({onSuccess: async (path) => {
                        const file = "D:/Projects/Server/db.service/Files/"+ user.email + '.' + path.split(".").pop();
                        fs.rename(path, file , function (err) {
                            if (err) throw err;
                            console.log('File Rename err.');
                          },);
                        await User.findOneAndUpdate({
                            authToken : data.authToken
                        },{
                            pic : file,
                            setup : true
                        })
                        client.emit('setupResult',{result : 'Setup SuccessFul !'});
                        },onErr: err => console.log(err)});
                    client.emit('fs-start',{eventname:eventname});
                } else {
                    await User.findOneAndUpdate({
                        authToken : data.authToken
                    },{
                        setup : true
                    })
                    client.emit('setupResult',{result : 'Setup SuccessFul !'});
                }
            } else {
                client.emit('setupResult',{result : 'Invalid Credentials !'});
            }
        } else {
            client.emit('setupResult',{result : 'User Not Found !'});
        }
    })
    client.on('getDepartmentsDB',async (data) => {
        // console.log(data);
        data = JSON.parse(data);
        var user = await User.findOne({authToken : data.authToken});
        if(user != null){
            users = await User.find();
            var depts = [];
            users.forEach(e => {
                if(e.email != user.email){
                    if(e.dept != null){
                        if(!depts.includes(e.dept.toString()))
                            depts.push(e.dept.toString());
                    }
                }
            });
            // console.log(depts);
            
            client.emit('departmentDB',{depts});
        } else {
            client.emit('ForceLogout');
        }
    })
    client.on('getDepartmentDB',async (data) => {
        data = JSON.parse(data);
        // console.log(data);
        var user = await User.findOne({authToken : data.authToken});
        var res = {};
        if(user != null){
            var users = await User.find();
            await users.forEach(e => {
                if(e.email != user.email){
                    if(e.dept.toUpperCase() == data.dept.toUpperCase()) {
                        if(e.role != "Student"){
                            if(e.post == "HOD") {
                                res.hod = e.email
                            } else if(e.post == "Assistant HOD") {
                                res.assisthod = e.email
                            } else if(e.post == "Professor") {
                                if(res.profs == null) {
                                    res.profs = [];
                                }
                                res.profs.push(e.email);
                            } else if(e.post == "Assistant Professor") {
                                if(res.assistprofs == null) {
                                    res.assistprofs = [];
                                }
                                res.assistprofs.push(e.email);
                            } else if(e.post == "Staff") {
                                if(res.staffs == null) {
                                    res.staffs = [];
                                }
                                res.staffs.push(e.email);
                            }
                        } else {
                            if(res.students == null){
                                res.students = [];
                            }
                            res.students.push(e.email);
                        }
                    }
                }
            })
            // console.log(res);
            client.emit("departmentData",res);
        } else {
            client.emit("ForceLogout");
        }
    })
    client.on('getUserImage',async (data) => {
        data = JSON.parse(data);
        console.log(data);
        client.emit('initGetUserImage');
        var user = await User.findOne({authToken : data.authToken});
        if(user != null){
            var Auser = await User.findOne({ email : data.email });
            if(Auser != null){
                if(Auser.pic == null){
                    client.emit('endGetUserImage',{ eventName : data.authToken+'-image-'+Auser.email });
                } else {
                    var filetrans = new FileTrans({eventname : data.authToken+'-image-'+Auser.email,socket: client});
                    await filetrans.send({ Filepath : Auser.pic , onSuccess : ()=>{
                       
                    },onErr : err => console.log(err)});
                }
            }
        } else {
            client.emit('ForceLogout');
        }
    })
    client.on('getStudentYear',async (data) => {
        data = JSON.parse(data);
        console.log(data);
        var user = await User.findOne({ authToken : data.authToken });
        if(user != null){
            var Auser = await User.findOne({ email : data.email });
            if(Auser != null){
                if(Auser.role == 'Student'){
                    console.log(Auser.year);
                    client.emit("studentYearData"+data.email+data.authToken,{ year : Auser.year });
                } else {
                    client.emit("studentYearData"+data.email+data.authToken,{ err });
                } 
            } else {
                client.emit('studentYearData'+data.email+data.authToken,{ err });
            }
        } else {
            client.emit("ForceLogout");
        }
    })
    client.on('getUserName', async (data) => {
        data = JSON.parse(data);
        console.log(data + " for Name");
        var user = await User.findOne({ authToken : data.authToken });
        if(user != null){
            var Auser = await User.findOne({ email : data.email });
            if(Auser != null){
                client.emit("userName"+data.email+data.authToken,{ name : Auser.name }); 
            } else {
                client.emit('userName'+data.email+data.authToken,{ err });
            }
        } else {
            client.emit("ForceLogout");
        }
    })

});

app.use('/',r1);
app.use('/',r2);

server.listen(8080,
    () => {
        console.log(`server started ... at ${IP}:8080`);
    })