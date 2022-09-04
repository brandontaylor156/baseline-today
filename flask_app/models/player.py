from flask_app.config.mysqlconnection import connectToMySQL
from flask_app.models import action_shot, user as user_module
from flask_app import app, flash
from pprint import pprint
from datetime import date, datetime
import math
import re

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+$') 
PASSWORD_REGEX = re.compile(r"^(?=.*[\d])(?=.*[A-Z])(?=.*[a-z])(?=.*[@#$])[\w\d@#$]{6,12}$")
DATABASE = 'baseline_schema'

class Player:
    def __init__( self , data ):
        self.id = data['id']
        self.ranking = data['ranking']
        self.name = data['name']
        self.gender = data['gender']
        self.country = data['country'],
        self.movement = data['movement']
        self.competitions_played = data['competitions_played']
        self.points = data['points']
        self.pro_year = data['pro_year']
        self.handedness = data['handedness']
        self.highest_singles_ranking = data['highest_singles_ranking']
        self.weight = data['weight']
        self.height = data['height']
        self.date_of_birth = data['date_of_birth']
        self.win_total = data['win_total']
        self.match_total = data['match_total']
        self.created_at = data['created_at']
        self.updated_at = data['updated_at']
        self.action_shots = []
        self.users = []

    @classmethod
    def insert_player(cls, data):
        query = "INSERT INTO players (id, ranking, name, gender, country, movement, competitions_played, points) VALUES (%(id)s, %(ranking)s, %(name)s, %(gender)s, %(country)s, %(movement)s, %(competitions_played)s, %(points)s);"
        result = connectToMySQL(DATABASE).query_db(query, data)
        return result

    @classmethod
    def update_player1(cls, data):
        query = "UPDATE players SET ranking = %(ranking)s, movement = %(movement)s, competitions_played = %(competitions_played)s, points = %(points)s  WHERE id = %(id)s;"
        result = connectToMySQL(DATABASE).query_db(query, data)
        return

    @classmethod
    def update_player2(cls, data):
        query = "UPDATE players SET pro_year = %(pro_year)s, handedness = %(handedness)s, highest_singles_ranking = %(highest_singles_ranking)s, weight = %(weight)s, height = %(height)s, date_of_birth = %(date_of_birth)s, win_total = %(win_total)s, match_total = %(match_total)s WHERE id = %(id)s;"
        result = connectToMySQL(DATABASE).query_db(query, data)
        return

    @classmethod
    def select_player_by_id(cls, data):
        query = "SELECT * FROM players WHERE id = %(id)s"
        results = connectToMySQL(DATABASE).query_db(query, data)
        return Player(results[0])

    @classmethod
    def select_all_players(cls):
        query = "SELECT * FROM players ORDER BY gender, ranking;"
        results = connectToMySQL(DATABASE).query_db(query)
        players = []
        for result in results:
            players.append(Player(result))
        return players

    @classmethod
    def select_player_photos(cls, data):
        query = "SELECT * FROM players JOIN action_shots ON players.id = action_shots.player_id WHERE players.id = %(id)s"
        results = connectToMySQL(DATABASE).query_db(query, data)

        player = Player(results[0])

        for result in results:
            action_shot_dict = {
                'id': result['action_shots.id'],
                'path': result['path'],
                'player_id': result['player_id'],
                'created_at': result['action_shots.created_at'],
                'updated_at': result['action_shots.updated_at']
            }
            player.action_shots.append(action_shot.ActionShot(action_shot_dict))

        return player

    @classmethod
    def select_player_favorites(cls, data):
        query = "SELECT * FROM players JOIN favorites ON players.id = favorites.player_id JOIN users ON users.id = favorites.user_id WHERE players.id = %(id)s;"
        results = connectToMySQL(DATABASE).query_db(query, data)

        if (results):
            player = Player(results[0])
        else:
            return False

        
        for result in results:
            user_dict = {
                'id': result['users.id'],
                'first_name': result['first_name'],
                'last_name': result['last_name'],
                'email': result['email'],
                'password': result['password'],
                'created_at' : result['users.created_at'],
                'updated_at' : result['users.updated_at']
            }
            player.users.append(user_module.User(user_dict))

        return player
    