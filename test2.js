const percPlz = ({ total , part }) =>{
    var a = '[ ';
    var p = Math.floor( ( part / total ) * 10);
    for(var i = 0 ; i < 10 ; i++ ){
        if(p > i){ 
            a+='\x1b[32m\u25BA\x1b[0m ';
        } else {
            a+='\u25CF ';
        }
    }
    var percent = '';
    for (const e of p.toString()) {
        percent += parseInt(e) - 1 ;
    }
    a += ']'
    return percent +"  "+a;
  }

  console.log(percPlz({total :1000,part: 100}));