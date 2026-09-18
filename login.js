document.querySelector('#loginForm').addEventListener('submit', event => {
  event.preventDefault();
  API.run(document.querySelector('#loginNotice'),async()=>{
    await API.login(document.querySelector('#login').value,document.querySelector('#password').value);
    location.href='pdv.html';
  });
});
