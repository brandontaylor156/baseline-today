from flask_app.config.mysqlconnection import connectToMySQL
from flask_app import app, flash
from pprint import pprint
from datetime import date, datetime
import math
import re

DATABASE = 'baseline_schema'

class ActionShot:
    def __init__( self , data ):
        self.id = data['id']
        self.path = data['path']
        self.player_id = data['player_id']
        self.created_at = data['created_at']
        self.updated_at = data['updated_at']

    @classmethod
    def insert_action_shot(cls, data):
        query = "INSERT INTO action_shots (path, player_id) VALUES (%(path)s, %(player_id)s);"
        result = connectToMySQL(DATABASE).query_db(query, data)
        return result

    @classmethod
    def select_by_path(cls, data):
        query = "SELECT * FROM action_shots WHERE path = %(path)s;"
        result = connectToMySQL(DATABASE).query_db(query, data)
        if (result):
            return ActionShot(result[0])
        else:
            return False
