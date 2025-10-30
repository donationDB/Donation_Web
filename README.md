# Donation_project

A new Flutter project.
## 프로젝트 소프트웨어 아키텍쳐 디자인

---

### MVVM

1. **Model**
    1. services
        
        > 백엔드 CRUD / API 통신 및 HTTP 관련 구현 클래스 (ex. firebaseCRUD, ~CRUD class 등)
        > 
    2. repositories
        
        > services 코드를 활용하여 Business 코드 작성 (ex. userRepository, authRepository, chatRoomRepository class)
        > 
        
2. **View Model**
    1. view_models
        
        > view의 요청에 따라 상태를 변경하고 notify를 하거나, view 버튼 등의 비동기 요청을 처리하기 위해 Repository의 함수를 사용해 요청 및 결과 값을 받고 state를 업데이트 후 view에 notify 하는 코드를 작성
        > 
        
3. **View**
    1. views
        
        > UI 관련 코드를 작성하고 state 변경 시, UI update가 필요한 위젯에 view model을 binding 하여 작성.
        > 

### Foldering

1. assets
    1. fonts
        
        > 실제 폰트 관리 (ttf파일)
        > 
    2. images
        
        > 실제 이미지 관리
        > 
2. core
    1. constants
        
        > 불변인 파일 관리 (ex .env)
        > 
    2. utils
        
        > colors, fonts, images 관리
        > 
    3. widgets
        
        > 자주 사용하는 위젯 관리
        > 
3. models
    
    > 데이터 모델
    ex) userModel, TodoModel, CategoryModel, 등등
    > 
4. repository (위 설명 참고)
5. service (위 설명 참고)
6. view (위 설명 참고)
7. view_model (위 설명 참고)
