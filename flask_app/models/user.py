from flask_app.config.mysqlconnection import connectToMySQL
from flask_app.models import player as player_module
from flask_app import app, flash
from pprint import pprint
from datetime import date, datetime
import math
import re

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+$') 
PASSWORD_REGEX = re.compile(r"^(?=.*[\d])(?=.*[A-Z])(?=.*[a-z])(?=.*[@#$])[\w\d@#$]{6,12}$")
DATABASE = 'baseline_schema'

class User:
    def __init__( self , data ):
        self.id = data['id']
        self.first_name = data['first_name']
        self.last_name = data['last_name']
        self.email = data['email']
        self.password = data['password']
        self.created_at = data['created_at']
        self.updated_at = data['updated_at']
        self.players = []

    @classmethod
    def select_all_users(cls):
        query = "SELECT * FROM users ORDER BY first_name;"
        results = connectToMySQL(DATABASE).query_db(query)
        users = []
        for result in results:
            users.append( User(result) )
        return users

    @classmethod
    def select_user_by_user_id(cls, data):
        query = "SELECT * FROM users WHERE id = %(id)s;"
        result = connectToMySQL(DATABASE).query_db(query, data)
        return User(result[0])

    @classmethod
    def insert_user(cls, data):
        query = "INSERT INTO users (first_name, last_name, email, password) VALUES (%(first_name)s, %(last_name)s, %(email)s, %(password)s);"
        result = connectToMySQL(DATABASE).query_db(query, data)
        return result

    @classmethod
    def select_user_by_email(cls, data):
        query = "SELECT * FROM users WHERE email = %(email)s;"
        result = connectToMySQL(DATABASE).query_db(query, data)
        
        if len(result) < 1:
            return False
        
        return User(result[0])

    @classmethod
    def select_user_favorites(cls, data):
        query = "SELECT * FROM users JOIN favorites ON users.id = favorites.user_id JOIN players ON players.id = favorites.player_id WHERE users.id = %(id)s"
        results = connectToMySQL(DATABASE).query_db(query, data)

        if (results):
            user = User(results[0])
        else:
            return False

        for result in results:
            player_dict = {
                'id': result['players.id'],
                'ranking': result['ranking'],
                'name': result['name'],
                'gender': result['gender'],
                'country': result['country'],
                'movement': result['movement'],
                'competitions_played': result['competitions_played'],
                'points': result['points'],
                'pro_year': result['pro_year'],
                'handedness': result['handedness'],
                'highest_singles_ranking': result['highest_singles_ranking'],
                'weight': result['weight'],
                'height': result['height'],
                'win_total': result['win_total'],
                'date_of_birth': result['date_of_birth'],
                'match_total': result['match_total'],
                'created_at' : result['players.created_at'],
                'updated_at' : result['players.updated_at']
            }
            user.players.append(player_module.Player(player_dict))

        return user

    @classmethod
    def favorite(cls, data):
        query = "INSERT INTO favorites (player_id, user_id) VALUES (%(player_id)s, %(user_id)s)"
        result = connectToMySQL(DATABASE).query_db(query, data)
        return result

    @classmethod
    def select_favorite_value(cls, data):
        query = "SELECT * FROM favorites WHERE player_id = %(player_id)s AND user_id = %(user_id)s"
        result = connectToMySQL(DATABASE).query_db(query, data)
        if not result:
            return False

        return result[0]

    @classmethod
    def update_user(cls, data):
        query = "UPDATE users SET first_name = %(first_name)s, last_name = %(last_name)s, email = %(email)s WHERE id = %(user_id)s;"
        result = connectToMySQL(DATABASE).query_db(query, data)
        return

    @classmethod
    def delete_favorite(cls, data):
        query = "DELETE FROM favorites WHERE favorites.user_id = %(user_id)s AND favorites.player_id = %(player_id)s;"
        result = connectToMySQL(DATABASE).query_db(query, data)
        return

    @staticmethod
    def validate_update(user, session_email):
        is_valid = True

        if len(user['first_name']) < 1:
            flash("First name must be at least 1 character.", 'first_name')
            is_valid = False
        if user['first_name'].isalpha() == False:
            flash("First name must be letters.", 'first_name')
            is_valid = False

        if len(user['last_name']) < 1:
            flash("Last name must be at least 1 character.", 'last_name')
            is_valid = False
        if user['last_name'].isalpha() == False:
            flash("Last name must be letters.", 'last_name')

        if not EMAIL_REGEX.match(user['email']): 
            flash("Invalid email address!", 'email')
            is_valid = False

        if is_valid == True and user['email'] == session_email:
            return is_valid

        users = User.select_all_users()
        for user_iterator in users:
            if user_iterator.email == user['email']:
                flash("Email already being used.", 'email')
                is_valid = False

        return is_valid

    @staticmethod
    def validate_user(user):
        is_valid = True

        if len(user['first_name']) < 2:
            flash("First name must be at least 2 characters.", 'first_name')
            is_valid = False
        if user['first_name'].isalpha() == False:
            flash("First name must be letters.", 'first_name')
            is_valid = False

        if len(user['last_name']) < 2:
            flash("Last name must be at least 2 characters.", 'last_name')
            is_valid = False
        if user['last_name'].isalpha() == False:
            flash("Last name must be letters.", 'last_name')

        if not EMAIL_REGEX.match(user['email']): 
            flash("Invalid email address!", 'email')
            is_valid = False

        users = User.select_all_users()
        for user_iterator in users:
            if user_iterator.email == user['email']:
                flash("Email already being used.", 'email')
                is_valid = False

        if len(user['password']) < 8:
            flash("Password must be at least 8 characters.", 'password')
            is_valid = False

        if user['password'] != user['confirm']:
            flash("Passwords do not match.", 'confirm')
            is_valid = False

        if not PASSWORD_REGEX.match(user['password']):
            flash("Password must contain at least one digit, one uppercase letter, one lowercase letter, and one special character.", 'password')
            is_valid = False

        return is_valid

