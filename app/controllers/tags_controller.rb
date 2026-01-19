# frozen_string_literal: true

class TagsController < ApplicationController
  def index
    tags = Tag.order(:name).map do |tag|
      {
        id: tag.id,
        name: tag.name,
        pomodoro_count: PomodoroSession.where("tags LIKE ?", "%#{tag.name}%").count
      }
    end
    
    render json: { success: true, tags: tags }
  end

  def create
    name = params[:name]&.strip
    
    return render json: { success: false, error: "Name is required" }, status: :unprocessable_entity if name.blank?

    # Find or create the tag (case-insensitive)
    tag = Tag.find_or_initialize_by(name: name)
    
    if tag.new_record?
      if tag.save
        render json: { 
          success: true, 
          tag: { id: tag.id, name: tag.name, pomodoro_count: 0 }, 
          is_new: true 
        }, status: :created
      else
        render json: { success: false, errors: tag.errors.full_messages }, status: :unprocessable_entity
      end
    else
      # Tag already exists
      render json: { 
        success: true, 
        tag: { id: tag.id, name: tag.name, pomodoro_count: PomodoroSession.where("tags LIKE ?", "%#{tag.name}%").count }, 
        is_new: false 
      }, status: :ok
    end
  end

  def destroy
    tag = Tag.find_by(id: params[:id])
    
    if tag
      tag.destroy
      render json: { success: true }
    else
      render json: { success: false, error: "Tag not found" }, status: :not_found
    end
  end
end
