require('dotenv').config()
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const ejs = require('ejs');  // Add this line
const serviceAccount = require('./firebase-credentials.json');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const engine = require('ejs-mate'); // Import ejs-mate
const passport = require('passport');
const session = require('express-session');
const cookieSession = require('cookie-session');
const crypto = require('crypto');
const multer = require('multer');
// console.log(secretKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

require('./passport-setup')

const db = admin.firestore();

const app = express();
const port = 5000;

// Serve the public folder statically
app.get('/uploads/:filename', (req, res) => {
  res.sendFile(path.join(__dirname + '/uploads/' + req.params.filename));
});
app.use(express.static(path.join(__dirname, 'public')));
const currencySymbolMap = {
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'AED': 'AED',
  // Add more currency code to symbol mappings as needed
};

// Define the getCurrencySymbol function
app.locals.getCurrencySymbol = function(currencyCode) {
  return currencySymbolMap[currencyCode] || currencyCode;
};

app.set('view engine', 'ejs');  // Set EJS as the view engine
app.set('views', path.join(__dirname, 'views')); // Set the views directory
// Use express-session middleware
app.use(cookieSession({
  name:'fujtrade-session',
  keys:['key1','key2']
}))

app.use(session({
  secret: 'c91f60bca9fc56d7dc2884428cce1fca9aa972cea16f440200e6bbd2726131ee', // Replace with a strong secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set secure to true if using HTTPS
}));
// Middleware to check session
app.use((req, res, next) => {
  if (!req.session.views) {
    req.session.views = 1;
  } else {
    req.session.views += 1;
  }
  next();
});
app.use(passport.initialize())
app.use(passport.session())
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static('public'));


app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5000/');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(cors());
// app.use(express.bodyParser());
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
app.get('/home', (req, res) => {
  const isAuthenticated = req.session.user;
  let users_info=req.session.user;
  const user_photo=users_info.photo;
  res.render('home',{isAuthenticated,user_photo});
});
app.get('/signin', (req, res) => {
  res.render('signin');
});
app.get('/signup', (req, res) => {
  res.render('signup');
});
app.get('/success', (req, res) => {
  const tapId = req.query.tap_id;
  // Render your success page and pass tapId as a variable
  res.render('success', { tapId });
  // res.render('success');
});
app.get('/logout', (req, res) => {
  // Destroy the current session
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Internal Server Error');
    }

    // Redirect or respond after destroying session
    res.send('Logged out successfully!');
  });
});



app.get('/get_last_payment', async (req, res) => {
  const tapId = req.query.tap_id;

  // Fetch charge details from Tappayments API
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: 'Bearer sk_test_oRBMv8F1guXLipzY0VhI9Pkr'
    }
  };

  try {
    const response = await fetch(`https://api.tap.company/v2/charges/${tapId}`, options);
    const data = await response.json();

      res.json({ success: true, data });
}
catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/save_payment_data', async (req, res) => {
  const tapId = req.query.tap_id;

  // Fetch charge details from Tappayments API
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: 'Bearer sk_test_oRBMv8F1guXLipzY0VhI9Pkr'
    }
  };

  try {
    const response = await fetch(`https://api.tap.company/v2/charges/${tapId}`, options);
    const data = await response.json();
    // console.log(parsedData)
    // Check if chr_id already exists in the collection
    const chrIdExists = await doesChrIdExist(tapId);

    if (!chrIdExists) {
      succss_saveDataToFile(data);
      res.json({ success: true, data });
    } else {
      res.json({ success: false, error: 'Record with chr_id already exists.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function doesChrIdExist(chrId) {
  // Check if chr_id already exists in the collection
  const snapshot = await db.collection('recieved_payments').where('chr_id', '==', chrId).get();
  return !snapshot.empty;
}

function succss_saveDataToFile(data) {
  const content = JSON.stringify(data, null, 2);
  const parsedData = JSON.parse(content);
      // console.log(parsedData.id);
    const created=parsedData.transaction.created;
    const chr_id=parsedData.id;
    const status=parsedData.status;
    const amount=parsedData.amount;
    const currency=parsedData.currency;
    const description=parsedData.description;
    const card=parsedData.source.payment_method;
    const fname=parsedData.customer.first_name;
    const lname=parsedData.customer.last_name;
    const email=parsedData.customer.email;
    const phone=parsedData.customer.phone.country_code+' '+parsedData.customer.phone.number;
    const transaction=parsedData.reference.transaction;
    const order=parsedData.reference.order;
    const payment=parsedData.reference.payment;
     // Save to Firebase Firestore
     // Save to Firebase Firestore
  const datas={
    created,
    chr_id,
    status,
    amount,
    currency,
    description,
    card,
    fname,
    lname,
    email,
    phone,
    transaction,
    order,
    payment
  };

  if(status=='CAPTURED')
  {
    db.collection('recieved_payments').add(datas);

    fs.writeFileSync('charge_data.txt', content);
  }else{
    db.collection('failed_payments').add(datas);

    fs.writeFileSync('charge_failed_data.txt', content);
  }

}

app.get('/chargePage', (req, res) => {
  res.render('chargePage');
});

// Endpoint to handle webhook notifications
app.post('/webhook', (req, res) => {
  const paymentData = req.body;

  // Save the JSON data to a text file
  saveDataToFile(paymentData);

  // Respond to the webhook request
  res.status(200).json({ success: true });
});

function saveDataToFile(data) {
  const content = JSON.stringify(data, null, 2);

  // Append to a file or customize the file name as needed
  fs.appendFileSync('webhook_data.txt', content + '\n');
}


app.post('/createCharge', async (req, res) => {
  try {
    const tappaymentsApiResponse = await fetch('https://api.tap.company/v2/charges/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk_test_oRBMv8F1guXLipzY0VhI9Pkr'
        // Add any necessary headers for authentication or other purposes
      },
      body: JSON.stringify(req.body),
    });

    const responseData = await tappaymentsApiResponse.json();
    res.json(responseData);
  } catch (error) {
    console.error('Error creating charge:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.post('/save_account', (req, res) => {
    const { fname, lname, email, phone, password,country_code } = req.body;

    // Create a new document in the 'users' collection with the form data
    const data={
      fname,
      lname,
      email,
      country_code,
      phone,
      password,
    }
     db.collection('site_users').add(data)
    .then(() => {
      res.status(200).json({ success: true, message: "Data received and saved successfully." });
    })
    .catch(error => {
      res.status(500).json({ success: false, error: "Internal Server Error" });
    });

    
  
});

app.get('/payment/:linkId', async (req, res) => {
  const linkId = parseInt(req.params.linkId);
    const db = admin.firestore();

    const citiesRef = db.collection('links');
    const snapshot = await citiesRef.where('number', '==', linkId).get();
    if (snapshot.empty) {
      res.render('404');
      return;
    }  
    
    snapshot.forEach(doc => {
      const userData = doc.data();
      res.render('payment', { userData });
      // console.log(doc.id, '=>', doc.data());
    });
});

app.get('/google',passport.authenticate('google',{scope:['profile','email']}))

// app.get('/callback',passport.authenticate('google',{failureRedirect:'/failed'}),
// function(req,res)
//   {
    
//     res.redirect('/profile'); 
// })
// Set up Multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Set the destination folder for uploads
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext); // Rename the file with a unique name (timestamp + original extension)
  },
});

const upload = multer({ storage: storage });

// Google login route
app.get('/callback',
  upload.single('profilePhoto'), // Use the 'profilePhoto' field name specified in the form
  passport.authenticate('google', { failureRedirect: '/failed' }),
  async (req, res) => {
    try {
      // Check if the user already exists in Firestore
      const { id, displayName, emails, photos } = req.user;
      // const { fname, lname, email, phone, password,country_code } = req.body;
      const email = emails[0].value;
        // Split displayName into fname and lname
        const [fname, ...lnameArray] = displayName.split(' ');
        const lname = lnameArray.join(' ');
      const userSnapshot = await db.collection('site_users').where('email', '==', email).get();

      if (userSnapshot.empty) {
        // User doesn't exist, insert details into Firestore
        const userDoc = {
          googleId: id,
          fname,
          lname,
          email,
          phone:'',
          country_code:'',
          password:'',
          photo: req.file ? `uploads/${req.file.filename}` : photos[0].value,
          // Add other user details as needed
        };

        await db.collection('site_users').doc(id).set(userDoc);
      }

      // Set the user details in the session
      req.session.user = {
        id,
        fname,
        lname,
        email,
        country_code:'',
        phone:'',
        googleUser:'yes',
        photo: req.file ? `uploads/${req.file.filename}` : photos[0].value,
        // Add other user details as needed
      };

      res.redirect('/profile'); // Redirect to the home page
    } catch (error) {
      console.error('Error processing Google login:', error);
      res.redirect('/signup'); // Redirect to the home page in case of an error
    }
  }
);

// Route to get user information after login
// app.get('/profile', (req, res) => {
//   if (req.isAuthenticated()) {
//     const user = req.user;
//     res.json({
//       email: user.emails[0].value,
//       username: user.displayName,
//       photo: user.photos[0].value,
//     });
//   } else {
//     res.json({ error: 'User not authenticated' });
//   }
// });

app.get('/profile', (req, res) => {
  if (req.isAuthenticated()) {
    
  // req.session.user = { email: user.emails[0].value, username: user.displayName, photo: user.photos[0].value };
  let users_info=req.session.user;
  console.log(users_info);
  const isAuthenticated = req.session.user;
  const originalPath = users_info.photo;
  const convertedPath = originalPath.replace(/\\/g, '/');

    res.render('profile', { email: users_info.email,fname:users_info.fname,lname:users_info.lname,user_photo:convertedPath,username:users_info.username,
      phone:users_info.phone,country_code:users_info.country_code,country_symbol:users_info.country_symbol,isAuthenticated });
  } else {
    res.redirect('/');
  }
});

app.post('/updateProfile', upload.single('profileImage'), async (req, res) => {
  try {
    const { fname, lname, username, email, phone, password,country_code,country_symbol } = req.body;
      // Check if a file was uploaded
    
    // Fetch the user based on the provided email
    const usersRef = db.collection('site_users');
    const querySnapshot = await usersRef.where('email', '==', email).get();

    if (querySnapshot.empty) {
      // User not found
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

  


    // Assuming there's only one user with the given email
    const userDoc = querySnapshot.docs[0];
    const userId = userDoc.id;

         // Prepare an object with non-empty values to update in Firestore
     const updateData = {};
     if (fname)             updateData.fname = fname;
     if (lname)             updateData.lname = lname;
     if (username)          updateData.username = username;
     if (email)             updateData.email = email;
     if (country_code)      updateData.country_code = country_code;
     if (country_symbol)    updateData.country_symbol = country_symbol;
     if (phone)             updateData.phone = phone;
     if (password)          updateData.password = password;

     // Update user data in Firestore
         await db.collection('site_users').doc(userId).update(updateData);
     

    // Update the user's information in Firestore
    // const userRef = db.collection('site_users').doc(userId);

    // await userRef.update({
    //   fname,
    //   lname,
    //   username,
    //   email,
    //   country_code,
    //   phone,
    //   password,
    // });
    // Save profile image path to Firestore or use it as needed
    const profileImagePath = req.file ? req.file.path : null;

    if (req.file) {
      const profileImagePath = req.file.path;
      await db.collection('site_users').doc(userId).update({
          profileImage: profileImagePath,
      });
  }
   
    const normalizedProfileImagePath = req.file
  ? path.join('uploads', req.file.filename)
  : null;
    console.log(normalizedProfileImagePath);
    // Update session data
    req.session.user = {
      id:userId,
      fname: fname,
      lname: lname,
      username:username,
      email:email,
      country_code:country_code,
      country_symbol:country_symbol,
      phone:phone,
      googleUser:'yes',
      photo:normalizedProfileImagePath || req.session.user.photo, // Use the updated profile image path or keep the existing one
  };


    res.status(200).json({ success: true, message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});


// app.post('/submit', (req, res) => {
//   const { firstname, lastname, email,phone, amount, currency } = req.body;


  // const data = {
  //   firstname,
  //   lastname,
  //   email,
  //   phone,
  //   amount: parseFloat(amount),
  //   currency,
  //   timestamp: admin.firestore.FieldValue.serverTimestamp(),
  // };
  // // console.log(data);
  // db.collection('payments').add(data)
  //   .then(() => {
  //     console.log('Data saved to Firestore');
  //     res.render('home');
  //   })
  //   .catch(error => {
  //     console.error('Error saving to Firestore:', error);
  //     res.status(500).send('Internal Server Error');
  //   });
// });

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
