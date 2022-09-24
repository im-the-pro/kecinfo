const Jimp = require('jimp') ;

async function rotate(filename) {
   // Reading Image
   const image = await Jimp.read
   (filename);
   // Checking if any error occurs while rotating image
   image.rotate(90, function(err){
      if (err) throw err;
   })
   .write(filename);
}

rotate(filename);
console.log("Image is processed successfully");