import time
import config
import os, os.path
from datetime import date
from flask_app import app, render_template, request, redirect, session, flash
from requests import get
import json
from flask_app.models import user as user_module, player as player_module, action_shot as action_shot_module
from flask_bcrypt import Bcrypt
from pprint import pprint
bcrypt = Bcrypt(app)

################################################################################################

@app.route("/players")
def players():
    player_list = player_module.Player.select_all_players()

    if 'user_id' in session:
        query_data = {
            'id': session['user_id']
        }

        user = user_module.User.select_user_favorites(query_data)
        user_list = [0]*200

        if user:
            for player in user.players:
                if player.gender == 'men':
                    user_list[player.ranking-1] = player.ranking
                elif player.gender == 'women':
                    user_list[player.ranking+99] = player.ranking
            
        return render_template("players.html", players=player_list, user_favorites=user_list)

    
    return render_template("players.html", players=player_list)

###############################################################################################

@app.route("/player/<string:id>")
def player(id):

    response = get(f"http://api.sportradar.us/tennis/trial/v3/en/competitors/{id}/profile.json?api_key={config.api_key}")
    data = response.json()

    win_total = 0
    match_total = 0

    for period in data['periods']:
        win_total += period['statistics']['matches_won']
        match_total += period['statistics']['matches_played'] 

    if 'pro_year' not in data['info']:
        data['info']['pro_year'] = 0
    if 'weight' not in data['info']:
        data['info']['weight'] = 0
    if 'height' not in data['info']:
        data['info']['height'] = 0

    query_data = {
        'id': id,
        'pro_year': data['info']['pro_year'],
        'handedness': data['info']['handedness'],
        'highest_singles_ranking': data['info']['highest_singles_ranking'],
        'weight': data['info']['weight'],
        'height': data['info']['height'],
        'date_of_birth': data['info']['date_of_birth'],
        'win_total': win_total,
        'match_total': match_total
    }
    player_module.Player.update_player2(query_data)

    query_data = {
        'id': id
    }
    player = player_module.Player.select_player_by_id(query_data)
    player_photos = player_module.Player.select_player_photos(query_data)
    player_favorites = player_module.Player.select_player_favorites(query_data)


    ###### PLAYER SCORES ######
    time.sleep(1)
    response2 = get(f"http://api.sportradar.us/tennis/trial/v3/en/competitors/{id}/summaries.json?api_key={config.api_key}")
   
    summary = response2.json()

    if 'user_id' in session:
        query_data = {
            'id': session['user_id']
        }

        user_var = user_module.User.select_user_favorites(query_data)

        query_data = {
        'player_id': id,
        'user_id': session['user_id']
        }

        favorite_value = user_module.User.select_favorite_value(query_data)

        return render_template("player.html", player=player, player_photos=player_photos, player_favorites=player_favorites, user=user_var, summary=summary, favorite_value=favorite_value)

    return render_template("player.html", player=player, player_photos=player_photos, player_favorites=player_favorites, summary=summary)

###############################################################################################

@app.route("/scores")
def scores():
    response1 = get(f"http://api.sportradar.us/tennis/trial/v3/en/schedules/live/summaries.json?api_key={config.api_key}")
    live_data = response1.json()

    time.sleep(1)

    new_date = date.today() 
    response2 = get(f"http://api.sportradar.us/tennis/trial/v3/en/schedules/{new_date}/summaries.json?api_key={config.api_key}")
   
    today_data = response2.json()

    return render_template("scores.html", live_data=live_data, today_data=today_data, date_today=new_date)

###############################################################################################
