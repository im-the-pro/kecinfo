const app = require('express')();
const server = require('http').createServer(app);
const  io = require('socket.io')(server);
const fs = require('fs')
const Jimp = require('jimp');


const { route : r1 } = require('./db.service/service/createVerifyLink');
const { route : r2 , routeVerifyLinks } = require('./db.service/service/routeVerifyLinks');
const addUser = require('./db.service/User/addUser');
const searchUser = require('./db.service/User/searchUser');
const { IP } = require('./config');
const { comPass } = require('./db.service/service/passwordHash');
const { User, Chats } = require('./db.service/User/config');
const { UniqueId } = require("./db.service/service/getUniqueId");
const { FileTrans } = require('./db.service/service/fileTrans');
const e = require('express');
const { time } = require('console');
const { TIMEOUT } = require('dns');
const { chatDbNotify } = require('./socketHandler/chatDbNotify');

routeVerifyLinks();


const principalId = 'vignesha.19msc@kongu.edu';


const ForceLogout = (client) => {
    client.emit("ForceLogout");
}

const verifyUser = async (authToken) => {
    var user = await User.findOne({
        authToken
    })
    return user == null ? false : true;
}
// chatDbNotify()
setInterval(async () => {
    await User.updateMany({},{
        online : false,
    },{ multi : true } )
},2000);

io.on('connection', async (client) => {
    
    
    console.log('connected')          
                                                      /*<<<--- debug consoler here -->>>*/ 

    client.on("current-stat",async (data) => {
        data = JSON.parse(data);
        // console.log(data);
        var user = User.findOne({authToken : data.authToken})
        if(user != null){
            await User.findOneAndUpdate({
                authToken : data.authToken
            },{
                online : data.online
            })
            

            // client.removeAllListeners("disconnect")

            // client.on("disconnect",async () => {
            //     console.log('disconnect');
            //     await User.findOneAndUpdate({
            //         authToken : data.authToken
            //     },{
            //         online : false
            //     })
            // })
        } else {
            ForceLogout(client)
        }
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
                    
                    var chat = await Chats.findOne({ email : user.email })
                    if(chat == null){
                        await Chats.create({
                            email : user.email,
                            people : []
                        })
                    }
                    const list = async () => {
                        const auths = await User.find({}).select({ authToken : 1 , _id : 0 });
                        const list = [];
                        auths.forEach(e => {
                            if(!list.includes(e.authToken)) list.push(e.authToken)
                        });
                        return list 
                    }
                    const authToken = await UniqueId({list : await list() });
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
                            doLog: true,
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
                    setup : true
                })
                const eventname = data.authToken + "-setupProfile";
                console.log(data,eventname);
                if(data.image){
                    const filetrans = new FileTrans({eventname,socket:client,});
                    await filetrans.receive({
                        onSuccess: async (file) => {
                            const path = "D:/Projects/Server/db.service/Files/"+ user.email +"."+ file.name.split('.').pop()
                            fs.writeFileSync(path,file.buffer,(er)=> {console.log(er);});
                            // console.log(fs.readFileSync("D:/Projects/Server/db.service/Files/"+file.name,String).length,file.buffer.length);                
                            
                            async function rotateImage(filename) {
                              // Reading Image
                              const image = await Jimp.read
                              (filename);
                              // Checking if any error occurs while rotating image
                              image.rotate(90, function(err){
                                if (err) throw err;
                              })
                              .write(filename);
                            }
                            rotateImage(path);
                            await User.findOneAndUpdate({
                                authToken : data.authToken
                            },{
                                pic : path,
                                setup : true
                            })
                            client.emit('setupResult',{result : 'Setup SuccessFul !' , name : user.name});
                        },onErr: err => console.log(err)
                    });
                    client.emit('fs-start',{eventname:eventname});
                } else {
                    client.emit('setupResult',{result : 'Setup SuccessFul !' , name : user.name});
                    
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
                    await filetrans.receive({onSuccess: async (file) => {
                            const path = "D:/Projects/Server/db.service/Files/"+ user.email + '.' + file.name.split('.').pop()
                            fs.writeFileSync(path,file.buffer,(er)=> {console.log(er);});
                            // console.log(fs.readFileSync("D:/Projects/Server/db.service/Files/"+file.name,String).length,file.buffer.length);                
                            
                            async function rotateImage(filename) {
                              // Reading Image
                              const image = await Jimp.read
                              (filename);
                              // Checking if any error occurs while rotating image
                              image.rotate(90, function(err){
                                if (err) throw err;
                              })
                              .write(filename);
                            }
                            rotateImage(path);
                        await User.findOneAndUpdate({
                            authToken : data.authToken
                        },{
                            pic : path,
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
                    if(!(user.role == 'Student' && e.role == 'Student'))
                        if(e.dept != null){
                            if(!depts.includes(e.dept.toString()))
                                depts.push(e.dept.toString());
                        }
                }
            });
            console.log(depts);
            
            client.emit('departmentDB',{depts});
        } else {
            ForceLogout(client);
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
                    if(e.dept.toString().toUpperCase() == data.dept.toString().toUpperCase()) {
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
                        } else if(user.role != 'Student') {
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
            ForceLogout(client)
        }
    })
    client.on('getUserImage',async (data) => {
        data = JSON.parse(data);
        // console.log(data);
        client.emit('initGetUserImage');
        var user = await User.findOne({authToken : data.authToken});
        if(user != null){
            var Auser = await User.findOne({ email : data.email });
            if(Auser != null){
                if(Auser.pic == null){
                    client.emit('endGetUserImage',{ eventName : data.authToken+'-image-'+Auser.email , year : Auser.year });
                } else {
                    var filetrans = new FileTrans({eventname : data.authToken+'-image-'+Auser.email,socket: client});
                    await filetrans.send({ Filepath : Auser.pic , onSuccess : ()=>{
                       
                    },onErr : err => console.log(err)});
                }
            }
        } else {
            ForceLogout(client)
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
            ForceLogout(client)
        }
    })
    client.on('getUserName', async (data) => {
        data = JSON.parse(data);
        // console.log(data + " for Name");
        var user = await User.findOne({ authToken : data.authToken });
        if(user != null){
            var Auser = await User.findOne({ email : data.email });
            if(Auser != null){
                client.emit("userName"+data.email+data.authToken,{ name : Auser.name }); 
            } else {
                client.emit('userName'+data.email+data.authToken,{ err });
            }
        } else {
            ForceLogout(client)
        }
    })
    client.on('isUserOnline',async (data) => {
        data = JSON.parse(data);
        var user = await User.findOne({
            authToken : data.authToken
        });
        // console.log(data,user.email);
        if(user != null){
            user = await User.findOne({
                email : data.email,
            })
            if(user != null){
                client.emit('isUserOnlineResult',{ email : data.email, online : user.online });
            }
        } else {
            ForceLogout(client)
        }
    })
    client.on('getChatConnectionData', async (data) => {
        data = JSON.parse(data);
        // console.log(data);
        var user = await User.findOne({authToken : data.authToken});
        if(user != null){
            var chat = await Chats.findOne({email : data.email });
            var uchat = await Chats.findOne({email : user.email });
            var requested = false;
            var agreed = false;
            // console.log(chat);
            if(chat != null){
                var AChat = chat.people.find((e) => e.email == user.email)
                if(AChat == null){
                    await Chats.findOneAndUpdate({
                        email : data.email,
                    },{
                        $push : {
                            people : {
                                email : user.email
                            }
                        }
                    })
                } else {
                    agreed = AChat.agreed 
                    requested = AChat.requested
                }
                console.log("user : \n" + AChat);
            } else {
                client.emit("getChatConnectionDataResult",{ notActive : true })
            }
            if(uchat != null){
                var AChat = uchat.people.find((e) => e.email == data.email)
                if(AChat == null){
                    await Chats.findOneAndUpdate({
                        email : user.email,
                    },{
                        $push : {
                            people : {
                                email : data.email
                            }
                        }
                    })
                    console.log("Both not agreed");
                    client.emit("getChatConnectionDataResult",{ agree : false , request : true })
                } else {
                    if(agreed && requested) {
                        if(AChat.agreed && AChat.requested){
                            client.emit("getChatConnectionDataResult",{ agree : true , request : true })
                            console.log("Both agreed");
                        } else {
                            client.emit("getChatConnectionDataResult",{ agree : true , request : false })
                            console.log("he agreed");
                        }
                    } else if(requested) {
                        if(AChat.agreed && AChat.requested){
                            client.emit("getChatConnectionDataResult",{ agree : false , request : false })
                            console.log("i agreed");
                        }
                    } else {
                        console.log("Both not agreed");
                        client.emit("getChatConnectionDataResult",{ agree : false , request : true })
                    }
                }
                console.log("My : \n" + AChat);
            } else {
                ForceLogout(client)
            }
        } else {
            ForceLogout(client)
        }
    })
    client.on('setChatConnectionRequest', async (data) => {
        data = JSON.parse(data);
        console.log(data);
        var user = await User.findOne({authToken : data.authToken });
        if(user != null){
            var chat = await Chats.findOne({ email : data.email });
            var uChat = await Chats.findOne({ email : user.email });
            if(uChat != null){
                await Chats.findOneAndUpdate({
                    email : user.email,
                    "people.email" : data.email
                },{
                    $set : {
                        'people.$.agreed' : true,
                        'people.$.requested' : true,
                    }
                })
            } else {
                ForceLogout(client)
            }
            if(chat != null){
                var AChat = chat.people.find(e => e.email == user.email);
                if(AChat != null){
                    await Chats.findOneAndUpdate({
                        email : data.email,
                        "people.email" : user.email
                    },{
                        $set : {
                            'people.$.requested' : true,
                        }
                    })
                } else {
                    await Chats.findOneAndUpdate({
                        email : data.email
                    },{
                        $push : {
                            people : {
                                email : user.email,
                                requested : true,
                            }
                        }
                    })
                }
                chat = await Chats.findOne({ email : data.email });
                console.log(chat);
                client.emit("setChatConnectionRequestResult", { requested : true })
            }
        } else {
            ForceLogout(client);
        }
    })
    client.on('agreeChatConnectionRequest', async (data) => {
        data = JSON.parse(data);
        console.log(data);
        var user = await User.findOne({authToken : data.authToken });
        if(user != null){
            var chat = await Chats.findOne({ email : user.email });
            if(chat != null){
                var AChat = chat.people.find(e => e.email == data.email);
                if(AChat != null){
                    await Chats.findOneAndUpdate({
                        email : user.email,
                        "people.email" : data.email
                    },{
                        $set : {
                            'people.$.agreed' : true,
                        }
                    })
                }
                chat = await Chats.findOne({ email : user.email });
                console.log(chat);
                client.emit("agreeChatConnectionRequestResult", { agreed : true })
            } else {
                ForceLogout(client);
            }
        } else {
            ForceLogout(client);
        }
    })
    client.on('sendChatsDb', async (data) => {
        data = JSON.parse(data);
        // console.log("requesting ChatsDB");
        var user = await User.findOne({
            authToken : data.authToken
        });
        if(user != null){
            var chat = await Chats.findOne({
                email : user.email,
            });
            if(chat != null){
                chat.people.forEach(e => {

                    e.pendingChats.forEach(c => {
                        client.emit('pendingChatsResult',{
                            email: e.email,
                            chatId : c.chatId,
                            date: c.date,
                            data : c.data
                        })
                        client.removeAllListeners('pendingChatsResultOut');
                        client.on('pendingChatsResultOut',async (data) => {
                            data = JSON.parse(data);
                            console.log('pending chat sent'+data);
                            await Chats.findOneAndUpdate({
                                email : user.email,
                                'people.email' : e.email,
                            },{
                                $pull : {
                                    'people.$.pendingChats' : {chatId : data.chatId}
                                }
                            })
                            await Chats.findOneAndUpdate({
                                email : e.email,
                                'people.email' : user.email,
                            },{
                                $pull : {
                                    'people.$.sentChats' : {
                                        chatId : data.chatId
                                    }
                                }
                            })
                            await Chats.findOneAndUpdate({
                                email : e.email,
                                'people.email' : user.email,
                            },{
                                $push : {
                                    'people.$.receivedChat' : {
                                        chatId : data.chatId
                                    }
                                }
                            })
                        })
                    })
                    e.sentChats.forEach(c =>{
                        client.emit('sentChatsResult',{ email : e.email ,chatId : c.chatId })
                        client.removeAllListeners('sentChatsResultOut')
                        client.on('sentChatsResultOut',async (data) => {
                            data = JSON.parse(data);
                            await Chats.findOneAndUpdate({
                                email : user.email,
                                'people.email' : e.email,
                            },{
                                $pull : {
                                    'people.$.sentChats' : {chatId : data.chatId}
                                }
                            })
                        })
                    })
                    e.readChat.forEach(c =>{
                        client.emit('readChatResult',{ email : e.email ,chatId : c.chatId })
                        client.removeAllListeners('readChatResultOut');
                        client.on('readChatResultOut',async (data) => {
                            data = JSON.parse(data);
                            // console.log('read chat sents'+data);
                            await Chats.findOneAndUpdate({
                                email : user.email,
                                'people.email' : e.email,
                            },{
                                $pull : {
                                    'people.$.readChat' : {chatId : data.chatId}
                                }
                            })
                        })
                    })
                    e.receivedChat.forEach(c =>{
                        client.emit('receivedChatResult',{ email : e.email , chatId : c.chatId })
                        client.removeAllListeners('receivedChatResultOut');
                        client.on('receivedChatResultOut',async (data) => {
                            data = JSON.parse(data);
                            console.log('received chat sent'+data);
                            await Chats.findOneAndUpdate({
                                email : user.email,
                                'people.email' : e.email,
                            },{
                                $pull : {
                                    'people.$.receivedChat' : {chatId : data.chatId}
                                }
                            })
                        })
                    })
                    e.viewedChat.forEach(c =>{
                        client.emit('viewedChatResult',{ email : e.email , chatId : c.chatId })
                    })
                    e.deletedChat.forEach(c =>{
                        client.emit('deletedChatResult',{ email : e.email , chatId : c.chatId })
                    })
                });
            } else {
                ForceLogout(client)
            }
        } else {
            ForceLogout(client);
        }
    })
    client.on('sendTextChat', async (data) => {
        data = JSON.parse(data);
        console.log(data);
        const user = await User.findOne({
            authToken : data.authToken
        });
        if(user != null){
            const receiver = await Chats.findOne({
                email : data.email,
            })
            const sender = await Chats.findOne({
                email : user.email,
            })
            const receiverBox = await receiver.people.find(e => e.email == user.email);
            const senderBox = await sender.people.find(e => e.email == data.email);
            
            if(receiverBox != null && senderBox != null){

                var chatId = data.chatId; 

                var result , result2 ;
                console.log("Result " + receiverBox);

                result = await receiverBox.pendingChats.filter( e => e.chatId == chatId );
                result2 = await senderBox.sentChats.filter( e => e.chatId == chatId );
                console.log("Result " + result.toString() + result2);

                if(result.length == 0 && result2.length == 0){
                    await Chats.findOneAndUpdate({
                        email : data.email,
                        'people.email' : user.email,
                    },{
                        $push : {
                            'people.$.pendingChats' : {
                                type: 'text',
                                chatId ,
                                data : data.chat,
                                date : data.date,
                            }
                        }
                    })
                    var res = await Chats.findOneAndUpdate({
                        email : user.email,
                        'people.email' : data.email,
                    },{
                        $push : {
                            'people.$.sentChats' : {
                                chatId
                            }
                        }
                    })
                }

                // console.log(res);
            }
        } else {
            ForceLogout(client);
        }
    })
    client.on('readTextChat', async (data) => {
        data = JSON.parse(data);
        console.log(data);
        const user = await User.findOne({
            authToken : data.authToken
        });
        const receiver = await Chats.findOne({
            email : data.email,
        })

        if(user != null){
            const receiverBox = await receiver.people.find(e => e.email == user.email);
            
            if(receiverBox != null){

                var chatId = data.chatId 
                await Chats.findOneAndUpdate({
                    email : data.email,
                    'people.email' : user.email,
                },{
                    $pull : {
                        'people.$.sentChats' : {chatId}
                    }
                })
                await Chats.findOneAndUpdate({
                    email : data.email,
                    'people.email' : user.email,
                },{
                    $pull : {
                        'people.$.receivedChat' : {chatId}
                    }
                })
                await Chats.findOneAndUpdate({
                    email : data.email,
                    'people.email' : user.email,
                },{
                    $push : {
                        'people.$.readChat' : {
                            chatId
                        }
                    }
                })
            }

        } else {
            ForceLogout(client);
        }
    })
    client.on('sendBinChat',async (data) => {
        data = JSON.parse(data);
        console.log(data);
        const user = await User.findOne({
            authToken : data.authToken
        });
        const receiver = await Chats.findOne({
            email : data.email,
        })
        const sender = await Chats.findOne({
            email : user.email,
        })
        if(user != null){
            const receiverBox = await receiver.people.find(e => e.email == user.email);
            const senderBox = await sender.people.find(e => e.email == data.email);
            
            if(receiverBox != null && senderBox != null){

                var chatId = data.chatId //await UniqueId([]) + user.email + data.date;

                const res = await Chats.findOneAndUpdate({
                    email : data.email,
                    'people.email' : user.email,
                },{
                    $push : {
                        'people.$.pendingChats' : {
                            type: 'text',
                            chatId ,
                            data : data.chat,
                            date : data.date,
                        }
                    }
                })
            }

        } else {
            ForceLogout(client);
        }
    })

});

app.use('/',r1);
app.use('/',r2);

server.listen(8080,
    () => {
        console.log(`server started ... at ${IP}:8080`);
    })