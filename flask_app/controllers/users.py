from flask_app import app, render_template, request, redirect, session, flash
from requests import get
import json
from flask_app.models import user as user_module, player as player_module
from flask_bcrypt import Bcrypt
from pprint import pprint
bcrypt = Bcrypt(app)

@app.route("/")
def index():
    return render_template("index.html")

###############################################################################################

@app.route("/user/login")
def user_login():
    return render_template("login.html")

###############################################################################################

@app.route("/login", methods=['POST'])
def login():
    data = {
        "email": request.form['email'],
    }
    user_in_db = user_module.User.select_user_by_email(data)

    if not user_in_db:
        flash("Invalid Email/Password" , 'login')
        return redirect("/user/login")
    if not bcrypt.check_password_hash(user_in_db.password, request.form['password']):
        flash("Invalid Email/Password", 'login')
        return redirect("/user/login")

    session['user_id'] = user_in_db.id
    session['first_name'] = user_in_db.first_name
    session['email'] = user_in_db.email

    return redirect("/user/profile")
    
###############################################################################################

@app.route("/user/register", methods=['POST'])
def user_register():
    if not user_module.User.validate_user(request.form):
        return redirect("/user/login")

    pw_hash = bcrypt.generate_password_hash(request.form['password'])
    
    data = {
        "first_name": request.form['first_name'],
        "last_name": request.form['last_name'],
        "email": request.form['email'],
        "password": pw_hash
    }
    
    user_id = user_module.User.insert_user(data)
    session['user_id'] = user_id
    session['first_name'] = request.form['first_name']
    session['email'] = request.form['email']
    return redirect("/user/profile")

###############################################################################################

@app.route("/user/profile")
def user_profile():
    if 'user_id' not in session:
        return redirect("/")

    data = {
        'id': session['user_id']
    }

    user_var = user_module.User.select_user_favorites(data)

    return render_template("user_profile.html", user=user_var)

###############################################################################################

@app.route("/user/update", methods=['POST'])
def update_user():
    if 'user_id' not in session:
        return redirect("/")

    data = {
        'first_name': request.form['first_name'],
        'last_name': request.form['last_name'],
        'email': request.form['email'],
        'user_id': session['user_id']
    }
    if not user_module.User.validate_update(data, session['email']):
        return redirect("/user/profile")
    
    user_module.User.update_user(data)
    session['first_name'] = request.form['first_name']
    return redirect("/user/profile")

###############################################################################################

@app.route("/user/favorite/<string:id>/<string:endpoint>")
def user_favorite(id, endpoint):
    if 'user_id' not in session:
        return redirect("/user/login")

    data = {
        'player_id': id,
        'user_id': session['user_id']
    }
    user_module.User.favorite(data)
    if endpoint == 'v1':
        return redirect("/players")

    elif endpoint == 'v2':
        data = {
            'id': id
        }
        player = player_module.Player.select_player_by_id(data)
        return redirect(f"/player/{player.id}")

    elif endpoint == 'v3':
        return redirect("/user/profile")

###############################################################################################

@app.route("/user/delete/favorite/<string:id>/<string:endpoint>")
def user_delete_favorite(id, endpoint):
    if 'user_id' not in session:
        return redirect("/")

    data = {
        'user_id': session['user_id'],
        'player_id': id
    }
    user_module.User.delete_favorite(data)
    if endpoint == 'v1':
        return redirect("/players")

    elif endpoint == 'v2':
        data = {
            'id': id
        }
        player = player_module.Player.select_player_by_id(data)
        return redirect(f"/player/{player.id}")

    elif endpoint == 'v3':
        return redirect("/user/profile")
    return redirect("/players")

###############################################################################################

@app.route("/user/logout")
def user_logout():
    session.clear()
    return redirect("/")
