export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bracket_entries: {
        Row: {
          max_score: number
          picks: Json
          score: number
          tournament_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          max_score?: number
          picks: Json
          score?: number
          tournament_id: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          max_score?: number
          picks?: Json
          score?: number
          tournament_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bracket_entries_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          player_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          player_id: number
          user_id?: string
        }
        Update: {
          created_at?: string
          player_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_clutch: {
        Row: { dec_expected: number; dec_n: number; dec_variance: number; dec_won: number; player_id: number | null; player_key: string; tb_expected: number; tb_n: number; tb_variance: number; tb_won: number; tour: string }
        Insert: { dec_expected: number; dec_n: number; dec_variance: number; dec_won: number; player_id?: number | null; player_key: string; tb_expected: number; tb_n: number; tb_variance: number; tb_won: number; tour: string }
        Update: { dec_expected?: number; dec_n?: number; dec_variance?: number; dec_won?: number; player_id?: number | null; player_key?: string; tb_expected?: number; tb_n?: number; tb_variance?: number; tb_won?: number; tour?: string }
        Relationships: []
      }
      lab_denied: {
        Row: { gain: number; other_id: number | null; other_key: string; player_id: number | null; player_key: string; tour: string }
        Insert: { gain: number; other_id?: number | null; other_key: string; player_id?: number | null; player_key: string; tour: string }
        Update: { gain?: number; other_id?: number | null; other_key?: string; player_id?: number | null; player_key?: string; tour?: string }
        Relationships: []
      }
      lab_people: {
        Row: { birth_date: string | null; checked_at: string; country: string | null; name: string; player_key: string; tour: string; wikidata_id: string | null }
        Insert: { birth_date?: string | null; checked_at?: string; country?: string | null; name: string; player_key: string; tour: string; wikidata_id?: string | null }
        Update: { birth_date?: string | null; checked_at?: string; country?: string | null; name?: string; player_key?: string; tour?: string; wikidata_id?: string | null }
        Relationships: []
      }
      lab_ratings: {
        Row: { clay: number; grass: number; hard: number; matches: number; overall: number; player_id: number | null; player_key: string; tour: string; week: string }
        Insert: { clay: number; grass: number; hard: number; matches: number; overall: number; player_id?: number | null; player_key: string; tour: string; week: string }
        Update: { clay?: number; grass?: number; hard?: number; matches?: number; overall?: number; player_id?: number | null; player_key?: string; tour?: string; week?: string }
        Relationships: []
      }
      lab_title_chances: {
        Row: { champion: boolean; chance: number; path_chance: number | null; player_id: number | null; player_key: string; rating: number | null; tournament_id: number }
        Insert: { champion: boolean; chance: number; path_chance?: number | null; player_id?: number | null; player_key: string; rating?: number | null; tournament_id: number }
        Update: { champion?: boolean; chance?: number; path_chance?: number | null; player_id?: number | null; player_key?: string; rating?: number | null; tournament_id?: number }
        Relationships: []
      }
      league_members: {
        Row: {
          joined_at: string
          league_id: string
          nickname: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          nickname: string
          user_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          nickname?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          is_public: boolean
          created_at: string
          id: string
          invite_code: string
          name: string
          owner_id: string
        }
        Insert: {
          is_public?: boolean
          created_at?: string
          id?: string
          invite_code: string
          name: string
          owner_id: string
        }
        Update: {
          is_public?: boolean
          created_at?: string
          id?: string
          invite_code?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      match_recaps: {
        Row: {
          body: string
          created_at: string
          match_id: number
          model: string
        }
        Insert: {
          body: string
          created_at?: string
          match_id: number
          model: string
        }
        Update: {
          body?: string
          created_at?: string
          match_id?: number
          model?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_recaps_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          preview_notified_at: string | null
          confirmed: boolean
          duration: string | null
          id: number
          is_live: boolean
          not_before_text: string | null
          notified_at: string | null
          player1_country: string | null
          player1_game_score: string | null
          player1_id: number | null
          player1_name: string | null
          player2_country: string | null
          player2_game_score: string | null
          player2_id: number | null
          player2_name: string | null
          pre_match_p1: number | null
          provider: string
          provider_id: number
          result_detail: string | null
          round: string | null
          scheduled_at: string | null
          score: string | null
          score_changed_at: string | null
          season: number | null
          server: string | null
          set_scores: Json
          source_key: string | null
          source_url: string | null
          status: string
          tour: string
          tournament_id: number
          updated_at: string
          winner_id: number | null
          winner_side: number | null
        }
        Insert: {
          preview_notified_at?: string | null
          confirmed?: boolean
          duration?: string | null
          id?: never
          is_live?: boolean
          not_before_text?: string | null
          notified_at?: string | null
          player1_country?: string | null
          player1_game_score?: string | null
          player1_id?: number | null
          player1_name?: string | null
          player2_country?: string | null
          player2_game_score?: string | null
          player2_id?: number | null
          player2_name?: string | null
          pre_match_p1?: number | null
          provider?: string
          provider_id: number
          result_detail?: string | null
          round?: string | null
          scheduled_at?: string | null
          score?: string | null
          score_changed_at?: string | null
          season?: number | null
          server?: string | null
          set_scores?: Json
          source_key?: string | null
          source_url?: string | null
          status?: string
          tour: string
          tournament_id: number
          updated_at?: string
          winner_id?: number | null
          winner_side?: number | null
        }
        Update: {
          preview_notified_at?: string | null
          confirmed?: boolean
          duration?: string | null
          id?: never
          is_live?: boolean
          not_before_text?: string | null
          notified_at?: string | null
          player1_country?: string | null
          player1_game_score?: string | null
          player1_id?: number | null
          player1_name?: string | null
          player2_country?: string | null
          player2_game_score?: string | null
          player2_id?: number | null
          player2_name?: string | null
          pre_match_p1?: number | null
          provider?: string
          provider_id?: number
          result_detail?: string | null
          round?: string | null
          scheduled_at?: string | null
          score?: string | null
          score_changed_at?: string | null
          season?: number | null
          server?: string | null
          set_scores?: Json
          source_key?: string | null
          source_url?: string | null
          status?: string
          tour?: string
          tournament_id?: number
          updated_at?: string
          winner_id?: number | null
          winner_side?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      odds: {
        Row: {
          match_id: number
          player1_odds: number | null
          player2_odds: number | null
          updated_at: string | null
          vendor: string
        }
        Insert: {
          match_id: number
          player1_odds?: number | null
          player2_odds?: number | null
          updated_at?: string | null
          vendor: string
        }
        Update: {
          match_id?: number
          player1_odds?: number | null
          player2_odds?: number | null
          updated_at?: string | null
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      odds_history: {
        Row: {
          match_id: number
          player1_odds: number | null
          player2_odds: number | null
          taken_at: string
          vendor: string
        }
        Insert: {
          match_id: number
          player1_odds?: number | null
          player2_odds?: number | null
          taken_at?: string
          vendor: string
        }
        Update: {
          match_id?: number
          player1_odds?: number | null
          player2_odds?: number | null
          taken_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          code: string
          created_at: string
          ends_at: string
          host_id: string
          id: string
          match_id: number
          state: Json
        }
        Insert: {
          code: string
          created_at?: string
          ends_at?: string
          host_id: string
          id?: string
          match_id: number
          state?: Json
        }
        Update: {
          code?: string
          created_at?: string
          ends_at?: string
          host_id?: string
          id?: string
          match_id?: number
          state?: Json
        }
        Relationships: [
          {
            foreignKeyName: "parties_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      party_calls: {
        Row: {
          call_key: string
          called_at: string
          party_id: string
          side: number
          user_id: string
        }
        Insert: {
          call_key: string
          called_at?: string
          party_id: string
          side: number
          user_id?: string
        }
        Update: {
          call_key?: string
          called_at?: string
          party_id?: string
          side?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_calls_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_members: {
        Row: {
          joined_at: string
          nickname: string
          party_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          nickname: string
          party_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          nickname?: string
          party_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      picks: {
        Row: {
          match_id: number
          picked_at: string
          side: number
          user_id: string
        }
        Insert: {
          match_id: number
          picked_at?: string
          side: number
          user_id?: string
        }
        Update: {
          match_id?: number
          picked_at?: string
          side?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picks_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      player_images: {
        Row: {
          author: string
          fetched_at: string
          image_url: string
          license: string
          license_url: string | null
          player_id: number
          source_url: string
        }
        Insert: {
          author: string
          fetched_at?: string
          image_url: string
          license: string
          license_url?: string | null
          player_id: number
          source_url: string
        }
        Update: {
          author?: string
          fetched_at?: string
          image_url?: string
          license?: string
          license_url?: string | null
          player_id?: number
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_images_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_rating_history: {
        Row: {
          elo: number
          player_id: number
          tour: string
          week: string
        }
        Insert: {
          elo: number
          player_id: number
          tour: string
          week: string
        }
        Update: {
          elo?: number
          player_id?: number
          tour?: string
          week?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_rating_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_ratings: {
        Row: {
          clay_matches: number
          elo: number
          elo_clay: number
          elo_grass: number
          elo_hard: number
          grass_matches: number
          hard_matches: number
          last_played: string | null
          matches: number
          name: string | null
          player_id: number | null
          player_key: string
          tour: string
          updated_at: string
        }
        Insert: {
          clay_matches?: number
          elo: number
          elo_clay: number
          elo_grass: number
          elo_hard: number
          grass_matches?: number
          hard_matches?: number
          last_played?: string | null
          matches: number
          name?: string | null
          player_id?: number | null
          player_key: string
          tour: string
          updated_at?: string
        }
        Update: {
          clay_matches?: number
          elo?: number
          elo_clay?: number
          elo_grass?: number
          elo_hard?: number
          grass_matches?: number
          hard_matches?: number
          last_played?: string | null
          matches?: number
          name?: string | null
          player_id?: number | null
          player_key?: string
          tour?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birth_date: string | null
          birth_place: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          first_name: string | null
          full_name: string
          height_cm: number | null
          id: number
          image_checked_at: string | null
          last_name: string | null
          plays: string | null
          profile_refreshed_at: string | null
          provider: string
          provider_id: number
          search_name: string | null
          tour: string
          turned_pro: number | null
          updated_at: string
          weight_kg: number | null
          wikidata_id: string | null
        }
        Insert: {
          birth_date?: string | null
          birth_place?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          first_name?: string | null
          full_name: string
          height_cm?: number | null
          id?: never
          image_checked_at?: string | null
          last_name?: string | null
          plays?: string | null
          profile_refreshed_at?: string | null
          provider?: string
          provider_id: number
          search_name?: string | null
          tour: string
          turned_pro?: number | null
          updated_at?: string
          weight_kg?: number | null
          wikidata_id?: string | null
        }
        Update: {
          birth_date?: string | null
          birth_place?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string
          height_cm?: number | null
          id?: never
          image_checked_at?: string | null
          last_name?: string | null
          plays?: string | null
          profile_refreshed_at?: string | null
          provider?: string
          provider_id?: number
          search_name?: string | null
          tour?: string
          turned_pro?: number | null
          updated_at?: string
          weight_kg?: number | null
          wikidata_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          leaderboard_name: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          leaderboard_name?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          leaderboard_name?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: number
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: never
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: never
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      rankings: {
        Row: {
          movement: number | null
          player_id: number
          points: number | null
          rank: number
          ranking_date: string
          tour: string
        }
        Insert: {
          movement?: number | null
          player_id: number
          points?: number | null
          rank: number
          ranking_date: string
          tour: string
        }
        Update: {
          movement?: number | null
          player_id?: number
          points?: number | null
          rank?: number
          ranking_date?: string
          tour?: string
        }
        Relationships: [
          {
            foreignKeyName: "rankings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      stat_cache: {
        Row: { data: Json; key: string; updated_at: string }
        Insert: { data: Json; key: string; updated_at?: string }
        Update: { data?: Json; key?: string; updated_at?: string }
        Relationships: []
      }
      sync_state: {
        Row: {
          details: Json | null
          key: string
          last_refreshed_at: string | null
          locked_until: string | null
          status: string | null
        }
        Insert: {
          details?: Json | null
          key: string
          last_refreshed_at?: string | null
          locked_until?: string | null
          status?: string | null
        }
        Update: {
          details?: Json | null
          key?: string
          last_refreshed_at?: string | null
          locked_until?: string | null
          status?: string | null
        }
        Relationships: []
      }
      title_odds_snapshots: {
        Row: {
          odds: Json
          taken_at: string
          tournament_id: number
        }
        Insert: {
          odds: Json
          taken_at?: string
          tournament_id: number
        }
        Update: {
          odds?: Json
          taken_at?: string
          tournament_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "title_odds_snapshots_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          category: string | null
          draw_size: number | null
          end_date: string | null
          id: number
          location: string | null
          name: string
          provider: string
          provider_id: number
          season: number | null
          start_date: string | null
          surface: string | null
          tour: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          draw_size?: number | null
          end_date?: string | null
          id?: never
          location?: string | null
          name: string
          provider?: string
          provider_id: number
          season?: number | null
          start_date?: string | null
          surface?: string | null
          tour: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          draw_size?: number | null
          end_date?: string | null
          id?: never
          location?: string | null
          name?: string
          provider?: string
          provider_id?: number
          season?: number | null
          start_date?: string | null
          surface?: string | null
          tour?: string
          updated_at?: string
        }
        Relationships: []
      }
      trial_observations: {
        Row: {
          games_state: string
          id: number
          match_key: string
          observed_at: string
          players_key: string
          point_state: string | null
          source: string
          status: string | null
          tour: string
        }
        Insert: {
          games_state: string
          id?: never
          match_key: string
          observed_at?: string
          players_key: string
          point_state?: string | null
          source: string
          status?: string | null
          tour: string
        }
        Update: {
          games_state?: string
          id?: never
          match_key?: string
          observed_at?: string
          players_key?: string
          point_state?: string | null
          source?: string
          status?: string | null
          tour?: string
        }
        Relationships: []
      }
      trial_polls: {
        Row: {
          error: string | null
          http_status: number | null
          id: number
          latency_ms: number | null
          live_count: number | null
          polled_at: string
          source: string
          tour: string
        }
        Insert: {
          error?: string | null
          http_status?: number | null
          id?: never
          latency_ms?: number | null
          live_count?: number | null
          polled_at?: string
          source: string
          tour: string
        }
        Update: {
          error?: string | null
          http_status?: number | null
          id?: never
          latency_ms?: number | null
          live_count?: number | null
          polled_at?: string
          source?: string
          tour?: string
        }
        Relationships: []
      }
      wiki_draws: {
        Row: {
          bracket: Json | null
          checked_at: string | null
          discovered_at: string | null
          last_rev_at: string | null
          last_revid: number | null
          note: string | null
          page_title: string | null
          page_url: string | null
          status: string
          tournament_id: number
        }
        Insert: {
          bracket?: Json | null
          checked_at?: string | null
          discovered_at?: string | null
          last_rev_at?: string | null
          last_revid?: number | null
          note?: string | null
          page_title?: string | null
          page_url?: string | null
          status?: string
          tournament_id: number
        }
        Update: {
          bracket?: Json | null
          checked_at?: string | null
          discovered_at?: string | null
          last_rev_at?: string | null
          last_revid?: number | null
          note?: string | null
          page_title?: string | null
          page_url?: string | null
          status?: string
          tournament_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "wiki_draws_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bracket_leaderboard: {
        Args: { p_tournament_id: number }
        Returns: {
          is_me: boolean
          max_score: number
          name: string
          score: number
        }[]
      }
      bracket_open: { Args: { p_tournament_id: number }; Returns: boolean }
      create_league: {
        Args: { p_name: string; p_nickname: string }
        Returns: string
      }
      create_party: {
        Args: { p_match_id: number; p_nickname: string }
        Returns: string
      }
      event_history: {
        Args: { p_provider_id: number; p_tour: string }
        Returns: {
          category: string | null
          draw_size: number | null
          end_date: string | null
          loser: string | null
          loser_id: number | null
          match_id: number | null
          name: string
          season: number
          set_scores: Json | null
          start_date: string | null
          surface: string | null
          tournament_id: number
          winner: string | null
          winner_chance: number | null
          winner_id: number | null
          winner_side: number | null
        }[]
      }
      event_list: {
        Args: never
        Returns: { category: string | null; latest_id: number; latest_season: number; name: string; provider_id: number; seasons: number; surface: string | null; tour: string }[]
      }
      event_upsets: {
        Args: { p_limit?: number; p_provider_id: number; p_tour: string }
        Returns: { loser: string | null; loser_id: number | null; match_id: number; round: string | null; season: number; winner: string | null; winner_chance: number; winner_id: number | null }[]
      }
      finals_on_day: {
        Args: { p_day: number; p_month: number }
        Returns: {
          category: string | null
          loser: string | null
          loser_id: number | null
          match_id: number
          season: number | null
          set_scores: Json
          tour: string
          tournament: string
          tournament_id: number
          winner: string | null
          winner_id: number | null
          winner_side: number
        }[]
      }
      hide_stray_wiki_results: { Args: never; Returns: number }
      immutable_unaccent: { Args: { value: string }; Returns: string }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      is_party_member: { Args: { p_party_id: string }; Returns: boolean }
      join_league: {
        Args: { p_code: string; p_nickname: string }
        Returns: string
      }
      join_party: {
        Args: { p_code: string; p_nickname: string }
        Returns: string
      }
      lab_aging: {
        Args: { p_tour: string }
        Returns: { age: number; delta: number; players: number }[]
      }
      lab_denied_pairs: {
        Args: { p_limit?: number; p_tour: string }
        Returns: { gain: number; other: string; other_country: string | null; other_id: number; player: string; player_country: string | null; player_id: number }[]
      }
      lab_denied_totals: {
        Args: { p_tour: string }
        Returns: { cost_by_others: number; cost_others: number; country: string | null; name: string; player_id: number }[]
      }
      lab_draw_luck: {
        Args: { p_easiest: boolean; p_limit?: number; p_tour: string }
        Returns: { chance: number; country: string | null; name: string; path_chance: number; player_id: number | null; season: number; tournament: string; tournament_id: number }[]
      }
      lab_birth_dates: {
        Args: { p_tour: string }
        Returns: { birth_date: string; player_key: string }[]
      }
      lab_form: {
        Args: { p_days?: number; p_min?: number; p_tour: string }
        Returns: { country: string | null; expected: number; last_match: string; matches: number; name: string; player_id: number; wins: number }[]
      }
      lab_luck: {
        Args: { p_since?: number; p_tour: string }
        Returns: { country: string | null; entries: number; expected: number; finals_reached: number; name: string; player_id: number; titles: number }[]
      }
      lab_peaks: {
        Args: { p_limit?: number; p_tour: string }
        Returns: { clay: number; country: string | null; grass: number; hard: number; name: string; peak: number; player_id: number; week: string }[]
      }
      lab_unlinked_names: {
        Args: never
        Returns: { country: string | null; n: number; name: string; tour: string }[]
      }
      lab_title_extremes: {
        Args: { p_champions: boolean; p_limit?: number; p_tour: string }
        Returns: { category: string | null; chance: number; country: string | null; name: string; player_id: number | null; season: number; tournament: string; tournament_id: number }[]
      }
      league_standings: {
        Args: { p_league_id: string; p_since: string }
        Returns: {
          bracket_points: number
          correct: number
          is_me: boolean
          nickname: string
          settled: number
        }[]
      }
      match_open_for_picks: { Args: { p_match_id: number }; Returns: boolean }
      model_accuracy: {
        Args: never
        Returns: {
          brier: number
          correct: number
          matches: number
          ranked: number
          ranked_model_correct: number
          ranked_rank_correct: number
          season: number
          surface: string
          tour: string
        }[]
      }
      my_pick_history: {
        Args: never
        Returns: {
          match_id: number
          pre_match_p1: number
          settled_at: string
          side: number
          winner_side: number
        }[]
      }
      pickem_leaderboard: {
        Args: { p_since: string }
        Returns: {
          correct: number
          is_me: boolean
          model_correct: number
          name: string
          settled: number
        }[]
      }
      player_favorite_count: { Args: { p_player_id: number }; Returns: number }
      public_leagues: {
        Args: never
        Returns: { created_at: string; invite_code: string; members: number; name: string }[]
      }
      ranking_dates: { Args: { p_tour: string }; Returns: string[] }
      refresh_stat_cache: { Args: never; Returns: undefined }
      sample_league_standings: {
        Args: { p_season: number }
        Returns: {
          correct: number
          nickname: string
          settled: number
          strategy: string
        }[]
      }
      save_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: undefined
      }
      search_normalize: { Args: { value: string }; Returns: string }
      search_players: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          country_code: string
          current_rank: number
          full_name: string
          id: number
          tour: string
        }[]
      }
      set_league_public: { Args: { p_league_id: string; p_public: boolean }; Returns: undefined }
      set_pre_match_probs: { Args: { p_rows: Json }; Returns: number }
      stray_wiki_results: {
        Args: never
        Returns: {
          name: string
          results: number
          season: number
          tournament_id: number
        }[]
      }
      top_rivalries: {
        Args: { p_limit?: number; p_min?: number }
        Returns: {
          meetings: number
          name_a: string
          name_b: string
          player_a: number
          player_b: number
        }[]
      }
      try_acquire_sync_lock: {
        Args: { p_key: string; p_ttl_seconds: number }
        Returns: boolean
      }
      upset_rates: {
        Args: { p_from_season?: number }
        Returns: { dimension: string; favorite_chance: number; key: string; matches: number; upsets: number }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
